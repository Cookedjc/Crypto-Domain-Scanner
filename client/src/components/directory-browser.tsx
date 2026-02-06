import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  HardDrive,
  Network,
  Home,
  ArrowUp,
  Loader2,
  AlertCircle,
  MonitorSmartphone,
  Server,
} from "lucide-react";

interface BrowseResult {
  currentPath: string;
  parentPath: string | null;
  entries: Array<{
    name: string;
    path: string;
    type: 'directory' | 'drive' | 'mount' | 'file';
    accessible: boolean;
  }>;
  quickAccess?: Array<{
    name: string;
    path: string;
    type: string;
  }>;
  error?: string;
}

interface DirectoryBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

function getQuickAccessIcon(name: string) {
  if (name.includes('Root')) return HardDrive;
  if (name.includes('Home')) return Home;
  if (name.includes('Network') || name.includes('net')) return Network;
  if (name.includes('Mount')) return Server;
  if (name.includes('Media')) return MonitorSmartphone;
  return Folder;
}

function getEntryIcon(type: string) {
  if (type === 'mount') return Network;
  if (type === 'drive') return HardDrive;
  return Folder;
}

export function DirectoryBrowser({ open, onOpenChange, onSelect, initialPath }: DirectoryBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || '/');
  const [pathInput, setPathInput] = useState(initialPath || '/');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const startPath = initialPath && initialPath.trim() ? initialPath : '/';
      setCurrentPath(startPath);
      setPathInput(startPath);
      setSelectedPath(null);
    }
  }, [open, initialPath]);

  const { data, isLoading, error } = useQuery<BrowseResult>({
    queryKey: ['/api/filesystem/browse', currentPath],
    queryFn: async () => {
      const res = await fetch(`/api/filesystem/browse?path=${encodeURIComponent(currentPath)}`);
      if (!res.ok) throw new Error('Failed to browse');
      return res.json();
    },
    enabled: open,
    staleTime: 5000,
  });

  const navigateTo = useCallback((dirPath: string) => {
    setCurrentPath(dirPath);
    setPathInput(dirPath);
    setSelectedPath(null);
  }, []);

  const handleGoToPath = useCallback(() => {
    if (pathInput.trim()) {
      navigateTo(pathInput.trim());
    }
  }, [pathInput, navigateTo]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGoToPath();
    }
  }, [handleGoToPath]);

  const handleSelect = useCallback(() => {
    const finalPath = selectedPath || data?.currentPath || currentPath;
    onSelect(finalPath);
    onOpenChange(false);
  }, [selectedPath, data, currentPath, onSelect, onOpenChange]);

  const pathSegments = (data?.currentPath || currentPath).split('/').filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Browse Directories
          </DialogTitle>
          <DialogDescription>
            Navigate local and networked drives to select a directory path
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter path..."
            className="font-mono text-sm flex-1"
            data-testid="input-browse-path"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoToPath}
            data-testid="button-browse-go"
          >
            Go
          </Button>
        </div>

        <div className="flex items-center gap-1 text-sm overflow-x-auto py-1 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="px-1.5 text-xs font-mono"
            onClick={() => navigateTo('/')}
            data-testid="breadcrumb-root"
          >
            /
          </Button>
          {pathSegments.map((segment, idx) => {
            const segPath = '/' + pathSegments.slice(0, idx + 1).join('/');
            return (
              <span key={segPath} className="flex items-center gap-0.5">
                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-1.5 text-xs font-mono"
                  onClick={() => navigateTo(segPath)}
                  data-testid={`breadcrumb-${idx}`}
                >
                  {segment}
                </Button>
              </span>
            );
          })}
        </div>

        <div className="flex gap-3 flex-1 min-h-0">
          {data?.quickAccess && data.quickAccess.length > 0 && (
            <div className="w-[140px] shrink-0 space-y-1">
              <p className="text-xs font-medium text-muted-foreground px-1 mb-2">Quick Access</p>
              {data.quickAccess.map((qa) => {
                const QaIcon = getQuickAccessIcon(qa.name);
                return (
                  <Button
                    key={qa.path}
                    variant="ghost"
                    size="sm"
                    className={`w-full justify-start gap-2 text-xs ${currentPath === qa.path ? 'bg-muted' : ''}`}
                    onClick={() => navigateTo(qa.path)}
                    data-testid={`quick-access-${qa.name.toLowerCase().replace(/[^a-z]/g, '-')}`}
                  >
                    <QaIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{qa.name}</span>
                  </Button>
                );
              })}
            </div>
          )}

          <Separator orientation="vertical" className="h-auto" />

          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : error || data?.error ? (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                <AlertCircle className="w-6 h-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {data?.error || 'Unable to access this directory'}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-0.5 pr-3">
                  {data?.parentPath && (
                    <button
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover-elevate"
                      onClick={() => navigateTo(data.parentPath!)}
                      data-testid="button-browse-parent"
                    >
                      <ArrowUp className="w-4 h-4 shrink-0" />
                      <span className="font-mono text-xs">..</span>
                    </button>
                  )}

                  {data?.entries.length === 0 && !data?.parentPath && (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">No subdirectories found</p>
                    </div>
                  )}

                  {data?.entries.length === 0 && data?.parentPath && (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">No subdirectories in this folder</p>
                    </div>
                  )}

                  {data?.entries.map((entry) => {
                    const EntryIcon = getEntryIcon(entry.type);
                    const isSelected = selectedPath === entry.path;
                    return (
                      <button
                        key={entry.path}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                          isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover-elevate'
                        } ${!entry.accessible ? 'opacity-50' : ''}`}
                        onClick={() => setSelectedPath(entry.path)}
                        onDoubleClick={() => {
                          if (entry.accessible) {
                            navigateTo(entry.path);
                          }
                        }}
                        disabled={!entry.accessible}
                        data-testid={`browse-entry-${entry.name}`}
                      >
                        <EntryIcon className={`w-4 h-4 shrink-0 ${
                          entry.type === 'mount' ? 'text-blue-500' : 'text-amber-500'
                        }`} />
                        <span className="truncate font-mono text-xs">{entry.name}</span>
                        {entry.type === 'mount' && (
                          <Badge variant="outline" className="ml-auto text-[10px]">mount</Badge>
                        )}
                        {!entry.accessible && (
                          <Badge variant="outline" className="ml-auto text-[10px] text-muted-foreground">locked</Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        {selectedPath && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-md">
            <Folder className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs font-mono truncate">{selectedPath}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-browse-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleSelect}
            data-testid="button-browse-select"
          >
            {selectedPath ? 'Select Directory' : 'Use Current Directory'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
