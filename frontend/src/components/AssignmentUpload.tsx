import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { apiService } from '@/services/api';
import { 
  Upload, 
  FileArchive, 
  AlertCircle, 
  CheckCircle, 
  Code,
  Users,
  Shield
} from 'lucide-react';

interface AssignmentUploadProps {
  onAssignmentCreated?: (assignment: any) => void;
}

export default function AssignmentUpload({ onAssignmentCreated }: AssignmentUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    language: 'auto',
    timeout_seconds: 30,
    plagiarism_threshold: 80
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const languages = [
    { value: 'python', label: 'Python' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'java', label: 'Java' },
    { value: 'cpp', label: 'C++' },
    { value: 'go', label: 'Go' },
    { value: 'rust', label: 'Rust' }
  ];

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    setError(null);
    
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.endsWith('.zip')) {
        setError('Please select a ZIP file');
        return;
      }
      
      // Validate file size (100MB limit)
      if (selectedFile.size > 100 * 1024 * 1024) {
        setError('File size must be less than 100MB');
        return;
      }
      
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!file) {
      setError('Please select a ZIP file');
      return;
    }
    
    if (!formData.name.trim()) {
      setError('Assignment name is required');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append('zip_file', file);
      uploadFormData.append('name', formData.name);
      
      if (formData.description) {
        uploadFormData.append('description', formData.description);
      }
      
      if (formData.language && formData.language !== 'auto') {
        uploadFormData.append('language', formData.language);
      }
      
      uploadFormData.append('timeout_seconds', formData.timeout_seconds.toString());
      uploadFormData.append('plagiarism_threshold', (formData.plagiarism_threshold / 100).toString());

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const assignment = await apiService.createAssignment(uploadFormData);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      setSuccess(true);
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        language: 'auto',
        timeout_seconds: 30,
        plagiarism_threshold: 80
      });
      setFile(null);
      
      // Call callback
      if (onAssignmentCreated) {
        onAssignmentCreated(assignment);
      }
      
      // Close dialog after a short delay
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(false);
        setUploadProgress(0);
      }, 2000);
      
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to upload assignment');
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      language: 'auto',
      timeout_seconds: 30,
      plagiarism_threshold: 80
    });
    setFile(null);
    setError(null);
    setSuccess(false);
    setUploadProgress(0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) {
        resetForm();
      }
    }}>
      <DialogTrigger asChild>
        <Button className="w-full max-w-xs whitespace-nowrap text-sm">
          <Upload className="w-4 h-4 mr-2 shrink-0" />
          <span className="hidden md:inline">Upload Assignment</span>
          <span className="md:hidden">Upload</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="upload-assignment-description">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <FileArchive className="w-5 h-5 mr-2" />
            Upload Class Assignment
          </DialogTitle>
        </DialogHeader>
        <div id="upload-assignment-description" className="sr-only">
          Upload a ZIP file containing student submissions for automated grading and plagiarism detection
        </div>
        
        {success ? (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-700 mb-2">
              Assignment Uploaded Successfully!
            </h3>
            <p className="text-sm text-muted-foreground">
              Your assignment is being processed. Students' code will be executed and analyzed for plagiarism.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Assignment Details */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Assignment Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Python Assignment 1"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of the assignment..."
                  rows={3}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="language">Primary Language</Label>
                  <Select value={formData.language} onValueChange={(value) => 
                    setFormData(prev => ({ ...prev, language: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="Auto-detect" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      {languages.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="timeout">Execution Timeout (seconds)</Label>
                  <div className="flex items-center space-x-2">
                    <Slider
                      value={[formData.timeout_seconds]}
                      onValueChange={([value]) => 
                        setFormData(prev => ({ ...prev, timeout_seconds: value }))
                      }
                      max={120}
                      min={5}
                      step={5}
                      className="flex-1"
                    />
                    <span className="w-12 text-sm text-center shrink-0">
                      {formData.timeout_seconds}s
                    </span>
                  </div>
                </div>
              </div>
              
              <div>
                <Label htmlFor="threshold">Plagiarism Detection Threshold</Label>
                <div className="flex items-center space-x-2">
                  <Slider
                    value={[formData.plagiarism_threshold]}
                    onValueChange={([value]) => 
                      setFormData(prev => ({ ...prev, plagiarism_threshold: value }))
                    }
                    max={100}
                    min={50}
                    step={5}
                    className="flex-1"
                  />
                  <span className="w-12 text-sm text-center">
                    {formData.plagiarism_threshold}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Submissions with similarity above this threshold will be flagged
                </p>
              </div>
            </div>

            {/* File Upload */}
            <div>
              <Label htmlFor="file">Student Submissions (ZIP file) *</Label>
              <div className="mt-2">
                <Input
                  id="file"
                  type="file"
                  accept=".zip"
                  onChange={handleFileChange}
                  required
                />
                {file && (
                  <div className="mt-2 p-3 border rounded-lg bg-muted/50">
                    <div className="flex items-center space-x-2">
                      <FileArchive className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                ZIP file should contain folders with student names, each containing their code files
              </p>
            </div>

            {/* Upload Progress */}
            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Uploading and processing...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex items-center space-x-2 p-3 border border-red-200 rounded-lg bg-red-50">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            )}

            {/* Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-3">
                <div className="flex items-center space-x-2">
                  <Code className="w-4 h-4 text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium">Auto Execution</div>
                    <div className="text-xs text-muted-foreground">
                      Run all student code
                    </div>
                  </div>
                </div>
              </Card>
              
              <Card className="p-3">
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-green-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium">Plagiarism Check</div>
                    <div className="text-xs text-muted-foreground">
                      AI-powered analysis
                    </div>
                  </div>
                </div>
              </Card>
              
              <Card className="p-3">
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-purple-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium">Bulk Results</div>
                    <div className="text-xs text-muted-foreground">
                      Saved to each folder
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Submit Button */}
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={uploading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={uploading || !file || !formData.name.trim()}
                className="flex-1"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    <span className="hidden sm:inline">Uploading...</span>
                    <span className="sm:hidden">Upload...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Upload Assignment</span>
                    <span className="sm:hidden">Upload</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
