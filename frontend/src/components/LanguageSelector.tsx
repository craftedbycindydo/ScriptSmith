import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type Language } from '@/services/api';

interface LanguageSelectorProps {
  selectedLanguage: string;
  languages: Language[];
  onLanguageChange: (language: string) => void;
}

export default function LanguageSelector({ selectedLanguage, languages, onLanguageChange }: LanguageSelectorProps) {
  // Find the currently selected language to customize display
  const currentLanguage = languages.find(lang => lang.id === selectedLanguage);
  
  return (
    <Select value={selectedLanguage} onValueChange={onLanguageChange}>
      <SelectTrigger className="w-full sm:w-[180px] lg:w-[200px]">
        <SelectValue placeholder="Select language">
          {currentLanguage && (
            <>
              {/* Mobile: Show just the language name */}
              <span className="sm:hidden">{currentLanguage.name}</span>
              {/* Desktop: Show language name with version */}
              <span className="hidden sm:inline">
                {currentLanguage.name} {currentLanguage.version && `(${currentLanguage.version})`}
              </span>
            </>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {languages.map((language) => (
          <SelectItem key={language.id} value={language.id}>
            {language.name} {language.version && `(${language.version})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
