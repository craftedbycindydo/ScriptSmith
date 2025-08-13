import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiService, type CodeHistoryItem, type CodeHistoryResponse } from '@/services/api';
import { History, ChevronLeft, ChevronRight, Eye, Play, Copy, Code, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ReadOnlyCodeViewer from './ReadOnlyCodeViewer';

interface CodeHistoryProps {
  onLoadCode?: (code: string, language: string) => void;
}

export default function CodeHistory({ onLoadCode }: CodeHistoryProps) {
  const [history, setHistory] = useState<CodeHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [selectedItem, setSelectedItem] = useState<CodeHistoryItem | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [copiedItemId, setCopiedItemId] = useState<number | null>(null);
  const pageSize = 10;

  const loadHistory = async (page: number = 1) => {
    setLoading(true);
    try {
      const response: CodeHistoryResponse = await apiService.getCodeHistory(page, pageSize);
      setHistory(response.history);
      setTotalItems(response.total);
      setCurrentPage(response.page);
    } catch (error) {
      console.error('Failed to load code history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const totalPages = Math.ceil(totalItems / pageSize);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'success':
        return <Badge className="badge-success">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'timeout':
        return <Badge className="badge-warning">Timeout</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    return `${seconds.toFixed(3)}s`;
  };

  const handleLoadCode = (item: CodeHistoryItem) => {
    if (onLoadCode) {
      onLoadCode(item.code, item.language);
    }
  };

  const copyToClipboard = (text: string, itemId?: number) => {
    navigator.clipboard.writeText(text);
    if (itemId !== undefined) {
      setCopiedItemId(itemId);
      setTimeout(() => setCopiedItemId(null), 2000); // Reset after 2 seconds
    }
  };

  const toggleExpanded = (itemId: number) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <History className="w-5 h-5" />
          <span>Code Execution History</span>
          <Badge variant="outline">{totalItems} total</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">Loading history...</div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No code executions found. Start coding to see your history!
          </div>
        ) : (
          <div className="space-y-4">
            {/* History Items - Accordion Style */}
            <div className="space-y-2">
              {history.map((item) => {
                const isExpanded = expandedItemId === item.id;
                return (
                  <div
                    key={item.id}
                    className="border rounded-lg bg-card shadow-sm overflow-hidden"
                  >
                    {/* Clickable Header */}
                    <div 
                      className="p-4 cursor-pointer hover:bg-muted/30 transition-colors flex items-center justify-between"
                      onClick={() => toggleExpanded(item.id)}
                    >
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline">{item.language}</Badge>
                        {getStatusBadge(item.status)}
                        <span className="text-sm text-muted-foreground">
                          {formatDate(item.created_at)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {formatDuration(item.execution_time)}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {/* Action Buttons - Always Visible */}
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedItem(item);
                              }}
                              className="px-2"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle className="flex items-center space-x-2">
                              <Code className="w-5 h-5" />
                              <span>Code Execution Details - {selectedItem?.language}</span>
                            </DialogTitle>
                          </DialogHeader>
                          {selectedItem && (
                            <div className="space-y-6">
                              {/* Header Info */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                  <Badge variant="outline">{selectedItem.language}</Badge>
                                  {getStatusBadge(selectedItem.status)}
                                  <span className="text-sm text-muted-foreground">
                                    {formatDate(selectedItem.created_at)}
                                  </span>
                                  <span className="text-sm text-muted-foreground">
                                    Duration: {formatDuration(selectedItem.execution_time)}
                                  </span>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(selectedItem.code, selectedItem.id)}
                                >
                                  <Copy className="w-4 h-4 mr-2" />
                                  {copiedItemId === selectedItem.id ? 'Copied!' : 'Copy Code'}
                                </Button>
                              </div>
                              
                              {/* Code Section */}
                              <div>
                                <div className="flex items-center space-x-2 mb-3">
                                  <Code className="w-4 h-4" />
                                  <h4 className="font-semibold">Source Code</h4>
                                </div>
                                <ReadOnlyCodeViewer
                                  language={selectedItem.language}
                                  value={selectedItem.code}
                                  height={Math.min(400, Math.max(200, selectedItem.code.split('\n').length * 20))}
                                  showLineNumbers={true}
                                />
                              </div>

                              {/* Input Section */}
                              {selectedItem.input_data && (
                                <div>
                                  <div className="flex items-center space-x-2 mb-3">
                                    <Terminal className="w-4 h-4" />
                                    <h4 className="font-semibold">Input Data</h4>
                                  </div>
                                  <ReadOnlyCodeViewer
                                    language="plaintext"
                                    value={selectedItem.input_data}
                                    height={100}
                                    showLineNumbers={false}
                                    className="bg-muted/30"
                                  />
                                </div>
                              )}

                              {/* Output Section */}
                              {selectedItem.output && (
                                <div>
                                  <div className="flex items-center space-x-2 mb-3">
                                    <Terminal className="w-4 h-4 text-success" />
                                    <h4 className="font-semibold text-success">Output</h4>
                                  </div>
                                  <div className="bg-success/10 border border-success/20 rounded-lg p-4">
                                    <pre className="text-sm text-success-foreground whitespace-pre-wrap overflow-x-auto">
                                      {selectedItem.output}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {/* Error Section */}
                              {selectedItem.error_message && (
                                <div>
                                  <div className="flex items-center space-x-2 mb-3">
                                    <Terminal className="w-4 h-4 text-destructive" />
                                    <h4 className="font-semibold text-destructive">Error Message</h4>
                                  </div>
                                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                                    <pre className="text-sm text-destructive-foreground whitespace-pre-wrap overflow-x-auto">
                                      {selectedItem.error_message}
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadCode(item);
                        }}
                        className="px-2"
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                      
                      {/* Expand/Collapse Icon */}
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                      </div>
                    </div>

                    {/* Collapsible Content */}
                    {isExpanded && (
                      <div className="border-t bg-muted/20">
                        <div className="p-4 space-y-4">
                          {/* Full Code Display */}
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                <Code className="w-4 h-4" />
                                <h4 className="font-semibold">Complete Source Code</h4>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyToClipboard(item.code, item.id)}
                              >
                                <Copy className="w-4 h-4 mr-2" />
                                {copiedItemId === item.id ? 'Copied!' : 'Copy'}
                              </Button>
                            </div>
                            <ReadOnlyCodeViewer
                              language={item.language}
                              value={item.code}
                              height={Math.min(500, Math.max(200, item.code.split('\n').length * 22))}
                              showLineNumbers={true}
                            />
                          </div>

                          {/* Input Data */}
                          {item.input_data && (
                            <div>
                              <div className="flex items-center space-x-2 mb-3">
                                <Terminal className="w-4 h-4" />
                                <h4 className="font-semibold">Input Data</h4>
                              </div>
                              <ReadOnlyCodeViewer
                                language="plaintext"
                                value={item.input_data}
                                height={120}
                                showLineNumbers={false}
                                className="bg-muted/30"
                              />
                            </div>
                          )}

                          {/* Output Display */}
                          {item.output && (
                            <div>
                              <div className="flex items-center space-x-2 mb-3">
                                <Terminal className="w-4 h-4 text-success" />
                                <h4 className="font-semibold text-success">Output</h4>
                              </div>
                              <div className="bg-success/10 border border-success/20 rounded-lg p-4">
                                <pre className="text-sm text-success-foreground whitespace-pre-wrap overflow-x-auto font-mono">
                                  {item.output}
                                </pre>
                              </div>
                            </div>
                          )}

                          {/* Error Display */}
                          {item.error_message && (
                            <div>
                              <div className="flex items-center space-x-2 mb-3">
                                <Terminal className="w-4 h-4 text-destructive" />
                                <h4 className="font-semibold text-destructive">Error Message</h4>
                              </div>
                              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                                <pre className="text-sm text-destructive-foreground whitespace-pre-wrap overflow-x-auto font-mono">
                                  {item.error_message}
                                </pre>
                              </div>
                            </div>
                          )}

                          {/* Action Buttons in Expanded View */}
                          <div className="flex justify-end space-x-2 pt-2 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLoadCode(item)}
                            >
                              <Play className="w-4 h-4 mr-2" />
                              Load into Editor
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} results
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadHistory(currentPage - 1)}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadHistory(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
