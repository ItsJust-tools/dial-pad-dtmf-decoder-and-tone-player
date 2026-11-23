'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { ToolShell, useTool, ImportExport } from '@itsjust/core';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { toolConfig, templateBaseVersion, ToolCanvas, ToolToolbar, ToolSidebar } from '@/tool';
import { dtmfTool as dtmfToolDef } from '@/tool/tool-definition';
import {
  playbackDuration,
  sanitizeSequence,
  scheduleTones,
  clampToneDuration,
  clampPauseDuration,
} from '@/tool/tool-definition';
import { startDtmfPlayback, type DtmfPlaybackHandle } from '@/tool/playback';
import type { DtmfKey, ToolState } from '@/tool/types';
import { DEFAULT_STATE } from '@/tool/types';

export default function ToolClient() {
  const ToolShellCompat = ToolShell as unknown as ComponentType<Record<string, unknown>> & {
    Toolbar?: ComponentType<{ children?: ReactNode }>;
    Body?: ComponentType<{ children?: ReactNode }>;
    Sidebar?: ComponentType<{ children?: ReactNode }>;
    Canvas?: ComponentType<{ children?: ReactNode }>;
    StatusBar?: ComponentType<{ children?: ReactNode }>;
  };
  const canvasRef = useRef<HTMLDivElement>(null);
  const tool = useTool<ToolState>(dtmfToolDef, canvasRef);
  const setToolData = tool.state.setData;
  const showToast = tool.toast;
  const [isSharing, setIsSharing] = useState(false);
  const hasLoadedSharedState = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth > 768 && toolConfig.features.sidebar
  );

  const title = toolConfig.name;
  const state = tool.state.data;

  const [isPlaying, setIsPlaying] = useState(false);
  const [activeKey, setActiveKey] = useState<DtmfKey | null>(null);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const playbackRef = useRef<DtmfPlaybackHandle | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  const handleStateChange = useCallback(
    (updater: (prev: ToolState) => ToolState) => {
      setToolData(updater);
    },
    [setToolData]
  );

  const clearTimers = useCallback(() => {
    for (const id of timeoutsRef.current) window.clearTimeout(id);
    timeoutsRef.current = [];
  }, []);

  const stopPlayback = useCallback(() => {
    clearTimers();
    playbackRef.current?.stop();
    playbackRef.current = null;
    setIsPlaying(false);
    setActiveKey(null);
  }, [clearTimers]);

  const playSequence = useCallback(() => {
    const tones = scheduleTones(state.sequence, state.toneDuration, state.pauseDuration);
    if (tones.length === 0) return;
    stopPlayback();
    setIsPlaying(true);

    const handle = startDtmfPlayback({ tones });
    playbackRef.current = handle;
    handle.onToneStart((tone) => setActiveKey(tone.key));

    // Mirror the schedule for visual highlight timing in the UI.
    tones.forEach((tone) => {
      const id = window.setTimeout(
        () => {
          setActiveKey(tone.key);
          const off = window.setTimeout(() => setActiveKey(null), Math.max(0, tone.duration));
          timeoutsRef.current.push(off);
        },
        Math.max(0, tone.start)
      );
      timeoutsRef.current.push(id);
    });

    const total = playbackDuration(tones);
    const doneTimer = window.setTimeout(() => {
      setIsPlaying(false);
      setActiveKey(null);
      playbackRef.current = null;
    }, total + 20);
    timeoutsRef.current.push(doneTimer);
  }, [state.sequence, state.toneDuration, state.pauseDuration, stopPlayback]);

  useEffect(() => {
    return () => {
      for (const id of timeoutsRef.current) window.clearTimeout(id);
      playbackRef.current?.stop();
    };
  }, []);

  const handleCopySequence = useCallback(async () => {
    const dialString = sanitizeSequence(state.sequence);
    try {
      await navigator.clipboard.writeText(dialString);
      setCopyLabel('Copied!');
      window.setTimeout(() => setCopyLabel('Copy'), 1500);
      showToast('Dial string copied', 'success');
    } catch {
      showToast('Clipboard unavailable', 'error');
    }
  }, [state.sequence, showToast]);

  const handleSequenceChange = useCallback(
    (updater: (prev: ToolState) => ToolState) => {
      handleStateChange((prev) => {
        const next = updater(prev);
        // Normalize tone/pause durations so state stays valid from any UI path.
        return {
          ...next,
          toneDuration: clampToneDuration(next.toneDuration),
          pauseDuration: clampPauseDuration(next.pauseDuration),
        };
      });
    },
    [handleStateChange]
  );

  useEffect(() => {
    if (hasLoadedSharedState.current) return;
    hasLoadedSharedState.current = true;
    const params = new URLSearchParams(window.location.search);
    const encodedState = params.get('state');
    if (!encodedState) return;
    try {
      const serialized = decompressFromEncodedURIComponent(encodedState);
      if (!serialized) throw new Error('Invalid shared URL');
      const parsed: unknown = JSON.parse(serialized);
      const deserialized = dtmfToolDef.deserialize(parsed);
      if (!deserialized.success) throw new Error(deserialized.error);
      setToolData(deserialized.data);
      showToast('Loaded state from shared URL', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load shared URL';
      showToast(message, 'error');
    }
  }, [setToolData, showToast]);

  const handleShare = useCallback(async () => {
    setIsSharing(true);
    try {
      const serialized = dtmfToolDef.serialize(state);
      const encodedState = compressToEncodedURIComponent(serialized);
      if (!encodedState) throw new Error('Failed to encode state for URL');
      const url = new URL(window.location.href);
      url.searchParams.set('state', encodedState);
      url.searchParams.set('tool', toolConfig.id);
      window.history.replaceState(null, '', url.toString());

      const shareUrl = url.toString();
      if (navigator.share) {
        try {
          await navigator.share({ title, url: shareUrl });
          showToast('Shared URL ready', 'success');
          return;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(shareUrl);
      showToast('Share URL copied to clipboard', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create share URL';
      showToast(message, 'error');
    } finally {
      setIsSharing(false);
    }
  }, [showToast, state, title]);

  const handleClear = useCallback(() => {
    stopPlayback();
    setToolData(() => ({ ...DEFAULT_STATE }));
  }, [setToolData, stopPlayback]);

  const toolbarContent = (
    <>
      <ToolToolbar />
      <ImportExport
        formats={tool.supportedFormats}
        onExport={tool.handleExport}
        onImport={tool.importFromFile}
        isImporting={tool.isImporting}
        onShare={handleShare}
        isSharing={isSharing}
      />
    </>
  );

  const sidebarContent = <ToolSidebar state={state} />;

  const canvasContent = (
    <ToolCanvas
      canvasRef={canvasRef}
      state={state}
      onStateChange={handleSequenceChange}
      onClear={handleClear}
      activeKey={activeKey}
      isPlaying={isPlaying}
      onPlaySequence={playSequence}
      onStopPlayback={stopPlayback}
      onCopySequence={handleCopySequence}
      copyLabel={copyLabel}
    />
  );

  const keyCount = sanitizeSequence(state.sequence).length;

  const statusBarContent = (
    <>
      <span
        className={`status-slot status-slot-state ${tool.state.isDirty ? 'status-unsaved' : 'status-saved'}`}
      >
        {tool.state.isDirty ? (
          <>
            <span className="status-saving-dot" />
            Unsaved
          </>
        ) : tool.state.lastSaved ? (
          <>Saved {tool.state.lastSaved}</>
        ) : (
          'Ready'
        )}
      </span>
      <span className="status-slot">Keys: {keyCount}</span>
      <span className="status-slot">
        {state.toneDuration} ms tone / {state.pauseDuration} ms pause
      </span>
      <span className="status-slot status-slot-tool-version">Tool v{toolConfig.version}</span>
      <span className="status-slot status-slot-template-version">
        Template v{templateBaseVersion}
      </span>
    </>
  );

  const hasLegacySections = Boolean(
    ToolShellCompat.Toolbar &&
    ToolShellCompat.Body &&
    ToolShellCompat.Sidebar &&
    ToolShellCompat.Canvas &&
    ToolShellCompat.StatusBar
  );

  return (
    <ToolShellCompat
      config={toolConfig}
      actions={useMemo(() => tool.toolbarActions, [tool.toolbarActions])}
      sidebarOpen={sidebarOpen}
      onSidebarChange={setSidebarOpen}
      toolbar={toolbarContent}
      sidebar={sidebarContent}
      canvas={canvasContent}
      statusBar={statusBarContent}
    >
      {hasLegacySections
        ? (() => {
            const ToolbarSection = ToolShellCompat.Toolbar as ComponentType<{
              children?: ReactNode;
            }>;
            const BodySection = ToolShellCompat.Body as ComponentType<{ children?: ReactNode }>;
            const SidebarSection = ToolShellCompat.Sidebar as ComponentType<{
              children?: ReactNode;
            }>;
            const CanvasSection = ToolShellCompat.Canvas as ComponentType<{
              children?: ReactNode;
            }>;
            const StatusBarSection = ToolShellCompat.StatusBar as ComponentType<{
              children?: ReactNode;
            }>;
            return (
              <>
                <ToolbarSection>{toolbarContent}</ToolbarSection>
                <BodySection>
                  <SidebarSection>{sidebarContent}</SidebarSection>
                  <CanvasSection>{canvasContent}</CanvasSection>
                </BodySection>
                <StatusBarSection>{statusBarContent}</StatusBarSection>
              </>
            );
          })()
        : null}
    </ToolShellCompat>
  );
}
