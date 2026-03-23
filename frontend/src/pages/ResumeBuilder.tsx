import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { apiService, type ResumeResponse } from '@/services/api';
// PDF export uses browser's native print engine via iframe for pixel-perfect output
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Download,
  Plus,
  Trash2,
  GripVertical,
  FileText,
  Save,
  Loader2,
} from 'lucide-react';

// Preload Google Fonts so font switching is instant
const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;700&family=Lora:wght@400;700&family=Merriweather:wght@400;700&family=Roboto:wght@400;700&family=Open+Sans:wght@400;700&family=Source+Sans+3:wght@400;700&display=swap';
if (!document.querySelector(`link[href="${GOOGLE_FONTS_URL}"]`)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = GOOGLE_FONTS_URL;
  document.head.appendChild(link);
}

// --- Types ---
interface Education {
  school: string;
  degree: string;
  date: string;
}
interface SkillCategory {
  label: string;
  skills: string;
}
interface Experience {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}
interface Project {
  name: string;
  subtitle: string;
  link: string;
  date: string;
  bullets: string[];
}
interface ContactField {
  label: string;
  value: string;
}
interface ResumeData {
  fullName: string;
  contactFields: ContactField[];
  education: Education[];
  skillCategories: SkillCategory[];
  experience: Experience[];
  projects: Project[];
}

type SectionKey = 'education' | 'skillCategories' | 'experience' | 'projects';

const DEFAULT_RESUME: ResumeData = {
  fullName: 'Jane Smith',
  contactFields: [
    { label: 'Email', value: 'jane.smith@email.com' },
    { label: 'Phone', value: '+1 (555) 123-4567' },
    { label: 'Website', value: 'janesmith.dev' },
    { label: 'LinkedIn', value: 'linkedin.com/in/janesmith' },
  ],
  education: [
    { school: 'Stanford University', degree: 'Master of Science in Computer Science, GPA: 3.92/4.0', date: 'June 2022' },
    { school: 'UC Berkeley', degree: 'Bachelor of Science in Computer Engineering', date: 'May 2020' },
  ],
  skillCategories: [
    { label: 'Languages/Frameworks', skills: 'Python, Java, TypeScript, Go, React, Node.js, Django, Spring Boot' },
    { label: 'Cloud/Data', skills: 'AWS, GCP, Docker, Kubernetes, PostgreSQL, MongoDB, Redis, Kafka' },
    { label: 'AI/ML', skills: 'OpenAI API, LangChain, TensorFlow, PyTorch, RAG, Vector Databases' },
    { label: 'DevOps/Tools', skills: 'Jenkins, GitHub Actions, Terraform, Grafana, Git, Jira' },
  ],
  experience: [
    {
      company: 'Google', role: 'Software Engineer', startDate: 'July 2022', endDate: 'Present',
      bullets: [
        "Designed and implemented a distributed microservices architecture handling 2M+ requests per second for Google Cloud's identity management platform.",
        'Built a real-time data pipeline using Apache Kafka and BigQuery, reducing analytics latency from 15 minutes to under 30 seconds.',
        'Led migration of legacy monolith to Kubernetes-based microservices, improving deployment frequency by 300% and reducing incident response time by 60%.',
        'Mentored 3 junior engineers and led weekly architecture review sessions for the platform team.',
      ],
    },
    {
      company: 'Stripe', role: 'Backend Software Engineer Intern', startDate: 'June 2021', endDate: 'September 2021',
      bullets: [
        'Built Go-based payment reconciliation service processing $50M+ daily transactions with 99.99% accuracy.',
        'Designed and implemented webhook retry system with exponential backoff, reducing failed delivery rate by 85%.',
        'Created internal dashboard using React and GraphQL for real-time payment flow monitoring.',
      ],
    },
  ],
  projects: [
    {
      name: 'CodeMentor', subtitle: 'AI-Powered Code Review Platform', link: 'codementor.dev', date: '2023 - Present',
      bullets: [
        'Built an AI code review agent using GPT-4 with RAG over project documentation, providing context-aware suggestions across 10+ programming languages.',
        'Implemented semantic code search using vector embeddings and pgvector, enabling natural language queries over codebases with 95% relevance accuracy.',
        'Architected real-time collaboration features using WebSocket and CRDT, supporting 50+ concurrent reviewers per session.',
        'Deployed on AWS ECS with auto-scaling, handling 10K+ daily code reviews with sub-second response times.',
      ],
    },
    {
      name: 'DataFlow', subtitle: 'Visual ETL Pipeline Builder', link: 'github.com/janesmith/dataflow', date: '2022 - 2023',
      bullets: [
        'Created a drag-and-drop ETL pipeline builder with React Flow, supporting 20+ data source connectors and custom transformation nodes.',
        'Built distributed task execution engine in Python with Celery and Redis, processing 100GB+ datasets with checkpoint-based fault tolerance.',
        'Implemented real-time pipeline monitoring with Prometheus metrics and Grafana dashboards, reducing debugging time by 70%.',
      ],
    },
  ],
};

const FONT_SIZES: { label: string; value: number }[] = [];
for (let s = 7; s <= 14; s += 0.25) {
  FONT_SIZES.push({ label: s % 1 === 0 ? `${s}` : s.toFixed(s % 0.5 === 0 ? 1 : 2), value: s });
}

const MARGINS: { label: string; value: number }[] = [];
for (let m = 0.25; m <= 1.0; m += 0.05) {
  MARGINS.push({ label: `${m.toFixed(2)}in`, value: parseFloat(m.toFixed(2)) });
}

const FONTS = [
  { label: 'Computer Modern', value: "'CMU Serif', 'Latin Modern Roman', 'Times New Roman', serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Garamond', value: "'EB Garamond', Garamond, serif" },
  { label: 'Lora', value: "'Lora', serif" },
  { label: 'Merriweather', value: "'Merriweather', serif" },
  { label: 'Calibri', value: "Calibri, 'Gill Sans', sans-serif" },
  { label: 'Arial', value: "Arial, Helvetica, sans-serif" },
  { label: 'Roboto', value: "'Roboto', sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', sans-serif" },
  { label: 'Source Sans', value: "'Source Sans 3', sans-serif" },
];

const DEFAULT_SECTION_ORDER: SectionKey[] = ['education', 'skillCategories', 'experience', 'projects'];

// --- Sortable wrapper for sections ---
function SortableSection({
  id,
  title,
  onTitleChange,
  onAdd,
  children,
}: {
  id: string;
  title: string;
  onTitleChange: (value: string) => void;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <button {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-0.5 rounded hover:bg-accent">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          <span className="relative inline-grid items-center">
            <span
              className="invisible whitespace-pre text-xs font-bold uppercase tracking-wider px-1 py-0.5 col-start-1 row-start-1"
              aria-hidden="true"
            >
              {title || ' '}
            </span>
            <input
              className="text-xs font-bold uppercase tracking-wider text-foreground bg-transparent border-none outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5 col-start-1 row-start-1 min-w-[3rem]"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
            />
          </span>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onAdd}>
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>
      <div className="border-t border-border pt-2">{children}</div>
    </div>
  );
}

// --- Sortable wrapper for items (education entries, experience entries, etc.) ---
function SortableItem({
  id,
  label,
  onRemove,
  children,
}: {
  id: string;
  label: string;
  onRemove?: (() => void) | null;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className="mb-2 py-0 gap-0">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <button {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-0.5 rounded hover:bg-accent">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <span className="text-xs text-muted-foreground font-semibold ml-1">{label}</span>
            </div>
            {onRemove && (
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onRemove}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

function BulletList({ bullets, onChange }: { bullets: string[]; onChange: (b: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      {bullets.map((bullet, j) => (
        <div key={j} className="flex items-start gap-1.5">
          <span className="text-muted-foreground mt-2.5 text-[6px] shrink-0">&#9679;</span>
          <Textarea
            className="min-h-[36px] text-sm resize-y"
            placeholder="Describe what you did..."
            value={bullet}
            onChange={(e) => {
              const n = [...bullets];
              n[j] = e.target.value;
              onChange(n);
            }}
          />
          {bullets.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
              onClick={() => {
                const n = [...bullets];
                n.splice(j, 1);
                onChange(n);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="w-full h-7 text-xs text-muted-foreground border-dashed"
        onClick={() => onChange([...bullets, ''])}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add Bullet
      </Button>
    </div>
  );
}

function PSection({ title, fSize, children }: { title: string; fSize: number; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid #000', marginTop: '4pt' }}>
      <div style={{ fontSize: `${fSize + 2}pt`, fontWeight: 700, textTransform: 'uppercase', marginTop: '4pt', marginBottom: '2pt' }}>{title}</div>
      {children}
    </div>
  );
}

const DEFAULT_SECTION_TITLES: Record<SectionKey, string> = {
  education: 'Education',
  skillCategories: 'Skills',
  experience: 'Work Experience',
  projects: 'Projects',
};

// --- Main Component ---

export default function ResumeBuilder() {
  const [resume, setResume] = useState<ResumeData>(DEFAULT_RESUME);
  const [sectionOrder, setSectionOrder] = useState<SectionKey[]>(DEFAULT_SECTION_ORDER);
  const [sectionTitles, setSectionTitles] = useState<Record<SectionKey, string>>(DEFAULT_SECTION_TITLES);
  const [fontSize, setFontSize] = useState(10);
  const [margin, setMargin] = useState(0.5);
  const [fontFamily, setFontFamily] = useState(FONTS[0].value);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const previewRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  // Save/load state
  const { isAuthenticated } = useAuthStore();
  const [isSaving, setIsSaving] = useState(false);
  const [, setIsLoadingResumes] = useState(false);
  const [currentResumeId, setCurrentResumeId] = useState<number | null>(null);
  const [savedResumes, setSavedResumes] = useState<ResumeResponse[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogMode, setSaveDialogMode] = useState<'new' | 'overwrite'>('new');
  const [saveDialogName, setSaveDialogName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    window.scrollTo(0, 0);
    const handleResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const calcScale = () => {
      if (previewContainerRef.current && !isMobile) {
        const containerWidth = previewContainerRef.current.clientWidth;
        const paperWidth = 8.5 * 96;
        const padding = 40;
        const available = containerWidth - padding;
        const scale = Math.min(1, available / paperWidth);
        setPreviewScale(scale);
      } else {
        setPreviewScale(1);
      }
    };
    calcScale();
    window.addEventListener('resize', calcScale);
    return () => window.removeEventListener('resize', calcScale);
  }, [isMobile]);

  // Load saved resumes on mount if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setIsLoadingResumes(true);
      apiService.getResumes()
        .then((resumes) => setSavedResumes(resumes))
        .catch((err) => console.error('Failed to load resumes:', err))
        .finally(() => setIsLoadingResumes(false));
    }
  }, [isAuthenticated]);

  const [currentResumeTitle, setCurrentResumeTitle] = useState('');

  const buildPayload = (title: string) => ({
    title,
    resume_data: resume,
    section_order: sectionOrder as string[],
    section_titles: sectionTitles as Record<string, string>,
    font_family: fontFamily,
    font_size: fontSize,
    margin: margin,
  });

  const saveAsNew = async (title: string) => {
    setIsSaving(true);
    try {
      const saved = await apiService.saveResume(buildPayload(title));
      setCurrentResumeId(saved.id);
      setCurrentResumeTitle(title);
      const resumes = await apiService.getResumes();
      setSavedResumes(resumes);
    } catch (err) {
      console.error('Failed to save resume:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const overwriteExisting = async (id: number, title: string) => {
    setIsSaving(true);
    try {
      await apiService.updateResume(id, buildPayload(title));
      setCurrentResumeTitle(title);
      const resumes = await apiService.getResumes();
      setSavedResumes(resumes);
    } catch (err) {
      console.error('Failed to update resume:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    if (!isAuthenticated) return;

    if (currentResumeId) {
      // Editing an existing resume — show overwrite dialog
      setSaveDialogMode('overwrite');
      setSaveDialogName(currentResumeTitle);
    } else {
      // New resume — show name input dialog
      setSaveDialogMode('new');
      setSaveDialogName(resume.fullName || 'My Resume');
    }
    setSaveDialogOpen(true);
  };

  const handleSaveDialogConfirm = async (mode: 'overwrite' | 'new') => {
    if (!saveDialogName.trim()) return;
    setSaveDialogOpen(false);
    if (mode === 'overwrite' && currentResumeId) {
      await overwriteExisting(currentResumeId, saveDialogName);
    } else {
      await saveAsNew(saveDialogName);
    }
  };

  const handleLoadResume = async (resumeId: number) => {
    try {
      const loaded = await apiService.getResume(resumeId);
      setResume(loaded.resume_data as unknown as ResumeData);
      if (loaded.section_order) setSectionOrder(loaded.section_order as SectionKey[]);
      if (loaded.section_titles) setSectionTitles(loaded.section_titles as Record<SectionKey, string>);
      if (loaded.font_family) setFontFamily(loaded.font_family);
      if (loaded.font_size != null) setFontSize(loaded.font_size);
      if (loaded.margin != null) setMargin(loaded.margin);
      setCurrentResumeId(loaded.id);
      setCurrentResumeTitle(loaded.title || 'Untitled Resume');
    } catch (err) {
      console.error('Failed to load resume:', err);
    }
  };


  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = useCallback((path: string, value: any) => {
    setResume((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addItem = useCallback((arrayPath: string, item: any) => {
    setResume((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = arrayPath.split('.');
      let obj = next;
      for (const k of keys) obj = obj[k];
      obj.push(item);
      return next;
    });
  }, []);

  const removeItem = useCallback((arrayPath: string, index: number) => {
    setResume((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = arrayPath.split('.');
      let obj = next;
      for (const k of keys) obj = obj[k];
      obj.splice(index, 1);
      return next;
    });
  }, []);

  const handleExportPDF = () => {
    const paper = paperRef.current;
    if (!paper) return;

    // Clone the entire paper element with all its inline styles
    const paperClone = paper.cloneNode(true) as HTMLElement;
    paperClone.style.transform = 'none';
    paperClone.style.boxShadow = 'none';
    paperClone.style.overflow = 'visible';
    paperClone.style.maxHeight = 'none';
    paperClone.style.minHeight = 'auto';
    paperClone.style.width = '8.5in';

    // Create an iframe with the exact same content
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '0';
    iframe.style.width = '8.5in';
    iframe.style.height = '11in';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    // Copy ALL stylesheets from the main document into the iframe
    // so the paper renders with the exact same computed styles
    let stylesheets = '';
    for (const sheet of document.styleSheets) {
      try {
        if (sheet.href) {
          stylesheets += `<link rel="stylesheet" href="${sheet.href}" />\n`;
        } else if (sheet.ownerNode) {
          stylesheets += (sheet.ownerNode as HTMLElement).outerHTML + '\n';
        }
      } catch (e) {
        // Skip cross-origin sheets
      }
    }

    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html>
<html class="${document.documentElement.className}">
<head>
  <title>${resume.fullName || 'Resume'}</title>
  ${stylesheets}
  <style>
    @page { size: letter; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>${paperClone.outerHTML}</body>
</html>`);
    iframeDoc.close();

    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
    };
  };

  // --- Section drag end ---
  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSectionOrder((prev) => {
        const oldIndex = prev.indexOf(active.id as SectionKey);
        const newIndex = prev.indexOf(over.id as SectionKey);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  // --- Item drag end (for a given array path) ---
  const handleItemDragEnd = (arrayPath: string, ids: string[]) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      setResume((prev) => {
        const next = JSON.parse(JSON.stringify(prev));
        const keys = arrayPath.split('.');
        let obj = next;
        for (const k of keys) obj = obj[k];
        const [item] = obj.splice(oldIndex, 1);
        obj.splice(newIndex, 0, item);
        return next;
      });
    }
  };

  // --- Render each section's editor ---
  const renderSectionContent = (key: SectionKey) => {
    switch (key) {
      case 'education': {
        const ids = resume.education.map((_, i) => `edu-${i}`);
        return (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd('education', ids)}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {resume.education.map((edu, i) => (
                <SortableItem
                  key={ids[i]}
                  id={ids[i]}
                  label={edu.school || `Education ${i + 1}`}
                  onRemove={resume.education.length > 1 ? () => removeItem('education', i) : null}
                >
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input placeholder="School" value={edu.school} onChange={(e) => update(`education.${i}.school`, e.target.value)} />
                      <Input placeholder="Date" value={edu.date} onChange={(e) => update(`education.${i}.date`, e.target.value)} className="max-w-[140px]" />
                    </div>
                    <Input placeholder="Degree, GPA" value={edu.degree} onChange={(e) => update(`education.${i}.degree`, e.target.value)} />
                  </div>
                </SortableItem>
              ))}
            </SortableContext>
          </DndContext>
        );
      }
      case 'skillCategories': {
        const ids = resume.skillCategories.map((_, i) => `skill-${i}`);
        return (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd('skillCategories', ids)}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {resume.skillCategories.map((cat, i) => (
                <SortableSkillRow key={ids[i]} id={ids[i]}>
                  <Input
                    placeholder="Category"
                    value={cat.label}
                    onChange={(e) => update(`skillCategories.${i}.label`, e.target.value)}
                    className={isMobile ? 'max-w-[120px]' : 'max-w-[160px]'}
                  />
                  <Input placeholder="Skills (comma separated)" value={cat.skills} onChange={(e) => update(`skillCategories.${i}.skills`, e.target.value)} />
                  {resume.skillCategories.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive hover:text-destructive" onClick={() => removeItem('skillCategories', i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </SortableSkillRow>
              ))}
            </SortableContext>
          </DndContext>
        );
      }
      case 'experience': {
        const ids = resume.experience.map((_, i) => `exp-${i}`);
        return (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd('experience', ids)}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {resume.experience.map((exp, i) => (
                <SortableItem
                  key={ids[i]}
                  id={ids[i]}
                  label={exp.company || `Experience ${i + 1}`}
                  onRemove={resume.experience.length > 1 ? () => removeItem('experience', i) : null}
                >
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input placeholder="Company" value={exp.company} onChange={(e) => update(`experience.${i}.company`, e.target.value)} />
                      <Input placeholder="Role" value={exp.role} onChange={(e) => update(`experience.${i}.role`, e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <Input placeholder="Start Date" value={exp.startDate} onChange={(e) => update(`experience.${i}.startDate`, e.target.value)} className="max-w-[150px]" />
                      <Input placeholder="End Date" value={exp.endDate} onChange={(e) => update(`experience.${i}.endDate`, e.target.value)} className="max-w-[150px]" />
                    </div>
                    <BulletList bullets={exp.bullets} onChange={(b) => update(`experience.${i}.bullets`, b)} />
                  </div>
                </SortableItem>
              ))}
            </SortableContext>
          </DndContext>
        );
      }
      case 'projects': {
        const ids = resume.projects.map((_, i) => `proj-${i}`);
        return (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd('projects', ids)}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {resume.projects.map((proj, i) => (
                <SortableItem
                  key={ids[i]}
                  id={ids[i]}
                  label={proj.name || `Project ${i + 1}`}
                  onRemove={resume.projects.length > 1 ? () => removeItem('projects', i) : null}
                >
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input placeholder="Project Name" value={proj.name} onChange={(e) => update(`projects.${i}.name`, e.target.value)} />
                      <Input placeholder="Subtitle" value={proj.subtitle} onChange={(e) => update(`projects.${i}.subtitle`, e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <Input placeholder="Link (optional)" value={proj.link} onChange={(e) => update(`projects.${i}.link`, e.target.value)} />
                      <Input placeholder="Date" value={proj.date} onChange={(e) => update(`projects.${i}.date`, e.target.value)} className="max-w-[150px]" />
                    </div>
                    <BulletList bullets={proj.bullets} onChange={(b) => update(`projects.${i}.bullets`, b)} />
                  </div>
                </SortableItem>
              ))}
            </SortableContext>
          </DndContext>
        );
      }
      default:
        return null;
    }
  };

  const editorContent = (
    <div className="resume-editor p-4 space-y-1">
      {/* Contact Information (not draggable, always first) */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-foreground">Contact Information</Label>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => addItem('contactFields', { label: '', value: '' })}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Field
          </Button>
        </div>
        <div className="border-t border-border pt-2 space-y-2">
          <Input placeholder="Full Name" value={resume.fullName} onChange={(e) => update('fullName', e.target.value)} />
          {resume.contactFields.map((field, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Label"
                value={field.label}
                onChange={(e) => update(`contactFields.${i}.label`, e.target.value)}
                className="max-w-[120px]"
              />
              <Input
                placeholder="Value"
                value={field.value}
                onChange={(e) => update(`contactFields.${i}.value`, e.target.value)}
              />
              {resume.contactFields.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => removeItem('contactFields', i)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Draggable sections */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
        <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
          {sectionOrder.map((key) => (
            <SortableSection
              key={key}
              id={key}
              title={sectionTitles[key]}
              onTitleChange={(v) => setSectionTitles((prev) => ({ ...prev, [key]: v }))}
              onAdd={() => {
                const items: Record<SectionKey, unknown> = {
                  education: { school: '', degree: '', date: '' },
                  skillCategories: { label: '', skills: '' },
                  experience: { company: '', role: '', startDate: '', endDate: '', bullets: [''] },
                  projects: { name: '', subtitle: '', link: '', date: '', bullets: [''] },
                };
                addItem(key, items[key]);
              }}
            >
              {renderSectionContent(key)}
            </SortableSection>
          ))}
        </SortableContext>
      </DndContext>
      <div className="h-10" />
    </div>
  );

  const previewContent = (
    <div
      ref={previewContainerRef}
      className="flex justify-center items-start min-h-full overflow-auto"
      style={{ padding: isMobile ? '12px' : '20px' }}
    >
      <div
        ref={paperRef}
        style={{
          width: isMobile ? '100%' : '8.5in',
          minHeight: isMobile ? 'auto' : '11in',
          maxHeight: isMobile ? 'none' : '11in',
          background: '#fff',
          color: '#000',
          padding: isMobile ? '16px' : `${margin}in`,
          paddingBottom: isMobile ? '16px' : '0.3in',
          fontFamily: fontFamily,
          fontSize: isMobile ? '9pt' : `${fontSize}pt`,
          lineHeight: 1.25,
          boxShadow: '0 2px 20px rgba(0,0,0,0.18)',
          overflow: isMobile ? 'visible' : 'hidden',
          flexShrink: 0,
          transform: isMobile ? 'none' : `scale(${previewScale})`,
          transformOrigin: 'top center',
        }}
      >
        <div ref={previewRef}>
          <div style={{ textAlign: 'center', marginBottom: '2pt' }}>
            <div style={{ fontSize: `${fontSize + 4}pt`, fontWeight: 700 }}>{resume.fullName || 'Your Name'}</div>
            <div style={{ fontSize: `${fontSize - 1}pt`, marginTop: '2pt' }}>
              {resume.contactFields.map((f) => f.value).filter(Boolean).join(' | ')}
            </div>
          </div>
          {sectionOrder.map((key) => {
            switch (key) {
              case 'education':
                return (
                  <PSection key={key} title={sectionTitles.education} fSize={fontSize}>
                    {resume.education.map((edu, i) => (
                      <div key={i} style={{ marginBottom: i < resume.education.length - 1 ? '2pt' : 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 700 }}>{edu.school}</span>
                          <span style={{ fontWeight: 700 }}>{edu.date}</span>
                        </div>
                        <div>{edu.degree}</div>
                      </div>
                    ))}
                  </PSection>
                );
              case 'skillCategories':
                return (
                  <PSection key={key} title={sectionTitles.skillCategories} fSize={fontSize}>
                    {resume.skillCategories.map((cat, i) => (
                      <div key={i} style={{ marginBottom: '1pt' }}>
                        <span style={{ fontWeight: 700 }}>{cat.label}:</span> {cat.skills}
                      </div>
                    ))}
                  </PSection>
                );
              case 'experience':
                return (
                  <PSection key={key} title={sectionTitles.experience} fSize={fontSize}>
                    {resume.experience.map((exp, i) => (
                      <div key={i} style={{ marginBottom: i < resume.experience.length - 1 ? '4pt' : 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>
                            <strong>{exp.company}</strong>
                            {exp.role ? ` -- ${exp.role}` : ''}
                          </span>
                          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', marginLeft: '8pt' }}>
                            {[exp.startDate, exp.endDate].filter(Boolean).join(' -- ')}
                          </span>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '16pt', listStyleType: 'disc' }}>
                          {exp.bullets.filter((b) => b.trim()).map((b, j) => (
                            <li key={j} style={{ marginBottom: '1pt', paddingLeft: '2pt' }}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </PSection>
                );
              case 'projects':
                return (
                  <PSection key={key} title={sectionTitles.projects} fSize={fontSize}>
                    {resume.projects.map((proj, i) => (
                      <div key={i} style={{ marginBottom: i < resume.projects.length - 1 ? '4pt' : 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>
                            <strong>{proj.name}</strong>
                            {proj.subtitle ? ` -- ${proj.subtitle}` : ''}
                            {proj.link ? ` | ${proj.link}` : ''}
                          </span>
                          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', marginLeft: '8pt' }}>{proj.date}</span>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '16pt', listStyleType: 'disc' }}>
                          {proj.bullets.filter((b) => b.trim()).map((b, j) => (
                            <li key={j} style={{ marginBottom: '1pt', paddingLeft: '2pt' }}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </PSection>
                );
              default:
                return null;
            }
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 pb-0">
      {/* Controls bar */}
      <div className="flex items-center justify-between p-2 px-4 bg-background border border-border rounded-xl my-2 shadow-sm flex-wrap gap-2">
        {!isMobile && (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Font</Label>
              <Select value={fontFamily} onValueChange={setFontFamily}>
                <SelectTrigger size="sm" className="w-[150px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Size</Label>
              <Select value={String(fontSize)} onValueChange={(v) => setFontSize(parseFloat(v))}>
                <SelectTrigger size="sm" className="w-[80px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_SIZES.map((s) => (
                    <SelectItem key={s.value} value={String(s.value)}>{s.label}pt</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Margin</Label>
              <Select value={String(margin)} onValueChange={(v) => setMargin(parseFloat(v))}>
                <SelectTrigger size="sm" className="w-[90px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARGINS.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        {isMobile && (
          <div className="flex items-center gap-1.5 flex-1 flex-wrap">
            <Select value={fontFamily} onValueChange={setFontFamily}>
              <SelectTrigger size="sm" className="flex-1 min-w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONTS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(fontSize)} onValueChange={(v) => setFontSize(parseFloat(v))}>
              <SelectTrigger size="sm" className="w-[70px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map((s) => (
                  <SelectItem key={s.value} value={String(s.value)}>{s.label}pt</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(margin)} onValueChange={(v) => setMargin(parseFloat(v))}>
              <SelectTrigger size="sm" className="w-[80px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARGINS.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <>
              {savedResumes.length > 0 && (
                <Select
                  value={currentResumeId ? String(currentResumeId) : ''}
                  onValueChange={(v) => {
                    if (v) handleLoadResume(Number(v));
                  }}
                >
                  <SelectTrigger size="sm" className="w-[160px] h-8 text-xs">
                    <SelectValue placeholder="Load resume..." />
                  </SelectTrigger>
                  <SelectContent>
                    {savedResumes.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="truncate">{r.title || 'Untitled'}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {new Date(r.updated_at).toLocaleDateString()}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button onClick={handleSave} size="sm" variant="outline" className="whitespace-nowrap" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save
              </Button>
            </>
          )}
          <Button onClick={handleExportPDF} size="sm" className="whitespace-nowrap">
            <Download className="h-4 w-4 mr-1.5" />
            Export PDF
          </Button>
        </div>

        {/* Save Dialog */}
        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {saveDialogMode === 'overwrite' ? 'Save Resume' : 'Save New Resume'}
              </DialogTitle>
              <DialogDescription>
                {saveDialogMode === 'overwrite'
                  ? `You are editing "${currentResumeTitle}". Overwrite it or save as a new resume.`
                  : 'Enter a name for your resume.'}
              </DialogDescription>
            </DialogHeader>
            <Input
              placeholder="Resume name"
              value={saveDialogName}
              onChange={(e) => setSaveDialogName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveDialogName.trim()) {
                  handleSaveDialogConfirm(saveDialogMode === 'overwrite' ? 'overwrite' : 'new');
                }
              }}
              autoFocus
            />
            <DialogFooter className="gap-2 sm:gap-0">
              {saveDialogMode === 'overwrite' && (
                <Button
                  variant="outline"
                  onClick={() => handleSaveDialogConfirm('new')}
                  disabled={!saveDialogName.trim()}
                >
                  Save as New
                </Button>
              )}
              <Button
                onClick={() => handleSaveDialogConfirm(saveDialogMode === 'overwrite' ? 'overwrite' : 'new')}
                disabled={!saveDialogName.trim()}
              >
                {saveDialogMode === 'overwrite' ? 'Overwrite' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Mobile tab switcher */}
      {isMobile ? (
        <Tabs defaultValue="edit" className="w-full">
          <TabsList className="w-full mb-3">
            <TabsTrigger value="edit" className="flex-1">
              <FileText className="h-4 w-4 mr-1.5" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex-1">
              <Download className="h-4 w-4 mr-1.5" />
              Preview
            </TabsTrigger>
          </TabsList>
          <TabsContent value="edit">
            <div className="w-full min-h-[70vh] bg-muted rounded-xl overflow-hidden">{editorContent}</div>
          </TabsContent>
          <TabsContent value="preview">
            <div className="w-full min-h-[70vh] bg-muted-foreground/10 rounded-xl overflow-hidden">{previewContent}</div>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex w-full h-[80vh] rounded-xl overflow-hidden border border-border shadow-sm">
          <div className="w-[38%] min-w-[340px] overflow-y-auto bg-muted border-r border-border">{editorContent}</div>
          <div className="w-[62%] overflow-y-auto bg-muted-foreground/10">{previewContent}</div>
        </div>
      )}
    </div>
  );
}

// --- Sortable skill row (inline drag handle) ---
function SortableSkillRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} className="flex items-center gap-2 mb-1.5">
      <button {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-0.5 rounded hover:bg-accent shrink-0">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {children}
    </div>
  );
}
