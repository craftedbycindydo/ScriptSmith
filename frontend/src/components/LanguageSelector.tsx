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
  return (
    <Select value={selectedLanguage} onValueChange={onLanguageChange}>
      <SelectTrigger className="w-full sm:w-[180px] lg:w-[200px]">
        <SelectValue placeholder="Select language" />
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
