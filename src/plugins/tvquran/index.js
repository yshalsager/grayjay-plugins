import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { extract_first, last_match } from '@lib/html.js'
import { cache_set, get_text, init_lru_caches } from '@lib/http.js'
import { audio_source_descriptor, thumbnails } from '@lib/media.js'
import { apply_pager_state, array_pager_class } from '@lib/paging.js'
import { clean_text } from '@lib/text.js'

const PLATFORM = 'tvQuran'
const BASE_URL = 'https://tvquran.com'
const DEFAULT_LIMIT = 20
const RECITATION_SCAN_PER_PAGE = 4
const DEFAULT_ICON = './TvQuranIcon.png'
const CACHE_LIMITS = {
  selectionCache: 120,
  reciterCache: 300,
  recitationCache: 600,
  reciterContentsCache: 50,
  categoryMetadataCache: 30
}
const DEFAULT_HEADERS = {
  'User-Agent': `grayjay.app/${bridge.buildVersion}`,
  Accept: 'text/html,application/xhtml+xml'
}

const LANGUAGES = [
  { code: 'ar', name: 'Arabic' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'German' }
]

const CATEGORIES = [
  {
    id: 5,
    name: { ar: 'تلاوات خاشعة', en: 'Beautiful Quran recitation', de: 'Schöne Koran Rezitation' },
    slug: {
      ar: '%D8%AA%D9%84%D8%A7%D9%88%D8%A7%D8%AA-%D8%AE%D8%A7%D8%B4%D8%B9%D8%A9',
      en: 'beautiful-quran-recitation',
      de: 'schone-koran-rezitation'
    }
  },
  {
    id: 22,
    name: { ar: 'تلاوات نادرة', en: 'Rare Recitations', de: 'Seltene Rezitationen' },
    slug: { ar: '%D8%AA%D9%84%D8%A7%D9%88%D8%A7%D8%AA-%D9%86%D8%A7%D8%AF%D8%B1%D8%A9', en: 'rare-recitations', de: 'seltene-rezitationen' }
  },
  {
    id: 7,
    name: { ar: 'تلاوات الاطفال', en: 'Recitations by children', de: 'Rezitationen von Kindern' },
    slug: {
      ar: '%D8%AA%D9%84%D8%A7%D9%88%D8%A7%D8%AA-%D8%A7%D9%84%D8%A7%D8%B7%D9%81%D8%A7%D9%84',
      en: 'recitations-by-children',
      de: 'rezitationen-von-kindern'
    }
  },
  {
    id: 6,
    name: { ar: 'الرقية الشرعية', en: 'Ruqyah', de: 'Ruqyah' },
    slug: { ar: '%D8%A7%D9%84%D8%B1%D9%82%D9%8A%D8%A9-%D8%A7%D9%84%D8%B4%D8%B1%D8%B9%D9%8A%D8%A9', en: 'ruqyah', de: 'ruqyah' }
  },
  {
    id: 8,
    name: { ar: 'أذكار اليوم', en: 'Daily Dhikr', de: 'Täglich Dhikr' },
    slug: { ar: '%D8%A3%D8%B0%D9%83%D8%A7%D8%B1-%D8%A7%D9%84%D9%8A%D9%88%D9%85', en: 'daily-dhikr', de: 'taglich-dhikr' }
  },
  {
    id: 4,
    name: { ar: 'أدعية مختارة', en: 'Dua', de: 'Dua' },
    slug: { ar: '%D8%A3%D8%AF%D8%B9%D9%8A%D8%A9-%D9%85%D8%AE%D8%AA%D8%A7%D8%B1%D8%A9', en: 'dua', de: 'dua' }
  },
  {
    id: 9,
    name: { ar: 'الأذان والتكبير', en: 'Adhan and Takbir', de: 'Adhan und Takbir' },
    slug: {
      ar: '%D8%A7%D9%84%D8%A3%D8%B0%D8%A7%D9%86-%D9%88%D8%A7%D9%84%D8%AA%D9%83%D8%A8%D9%8A%D8%B1',
      en: 'adhan-and-takbir',
      de: 'adhan-und-takbir'
    }
  },
  {
    id: 10,
    name: { ar: 'قرآنا عجبا', en: 'Amazing Quran', de: 'Wunderbarer Quran' },
    slug: { ar: '%D9%82%D8%B1%D8%A2%D9%86%D8%A7-%D8%B9%D8%AC%D8%A8%D8%A7', en: 'amazing-quran', de: 'wunderbarer-quran' }
  },
  {
    id: 13,
    name: { ar: 'تلاوات الزوار', en: 'Visitors recitations', de: 'Besucher Rezitationen' },
    slug: {
      ar: '%D8%AA%D9%84%D8%A7%D9%88%D8%A7%D8%AA-%D8%A7%D9%84%D8%B2%D9%88%D8%A7%D8%B1',
      en: 'visitors-recitations',
      de: 'besucher-rezitationen'
    }
  }
]

const SELECTION_SORTS = [
  { id: 'random', name: { ar: 'عشوائي', en: 'Random', de: 'Zufällig' } },
  { id: 'new', name: { ar: 'الأحدث', en: 'Recent', de: 'Neueste' } },
  { id: 'most_listened', name: { ar: 'الأكثر إستماعاً', en: 'Most listened', de: 'Meistgehört' } },
  { id: 'likes', name: { ar: 'الأكثر إعجاباً', en: 'Most liked', de: 'Meistgeliked' } }
]

const CATEGORY_DESCRIPTIONS = {
  4: {
    ar: 'أدعية مختارة بصيغ صوتية مباشرة من tvQuran.',
    en: 'Selected dua audio clips from tvQuran.',
    de: 'Ausgewählte Dua-Audioclips von tvQuran.'
  },
  5: {
    ar: 'أجمل التلاوات الخاشعة المختارة للتحميل والاستماع من tvQuran.',
    en: 'Beautiful and moving Quran recitation selections from tvQuran.',
    de: 'Schöne und bewegende Koranrezitationen von tvQuran.'
  },
  6: {
    ar: 'مختارات الرقية الشرعية بصوت القراء من tvQuran.',
    en: 'Ruqyah recitation selections from tvQuran reciters.',
    de: 'Ruqyah-Rezitationen ausgewählter tvQuran-Rezitatoren.'
  },
  7: {
    ar: 'مختارات من تلاوات الأطفال للقرآن الكريم.',
    en: 'Quran recitation selections by children.',
    de: 'Ausgewählte Koranrezitationen von Kindern.'
  },
  8: {
    ar: 'أذكار اليوم المختارة للاستماع والتحميل.',
    en: 'Daily dhikr audio selections for listening and download.',
    de: 'Tägliche Dhikr-Audioauswahlen zum Anhören und Herunterladen.'
  },
  9: {
    ar: 'مختارات الأذان والتكبير للاستماع والتحميل.',
    en: 'Adhan and takbir audio selections for listening and download.',
    de: 'Adhan- und Takbir-Audioauswahlen zum Anhören und Herunterladen.'
  },
  10: {
    ar: 'مختارات قرآنية مميزة من قسم قرآنا عجبا.',
    en: 'Distinctive Quran selections from the Amazing Quran category.',
    de: 'Besondere Koranauswahlen aus der Kategorie Wunderbarer Quran.'
  },
  13: {
    ar: 'تلاوات ومشاركات صوتية من زوار tvQuran.',
    en: 'Visitor-submitted recitation selections on tvQuran.',
    de: 'Von Besuchern eingereichte Rezitationsauswahlen auf tvQuran.'
  },
  22: {
    ar: 'تلاوات نادرة ومختارات صوتية مميزة من tvQuran.',
    en: 'Rare Quran recitation selections and special audio clips from tvQuran.',
    de: 'Seltene Koranrezitationen und besondere Audioauswahlen von tvQuran.'
  }
}

const VIDEO_CATEGORY_DESCRIPTIONS = {
  videos: {
    ar: 'مرئيات تلاوات القرآن من tvQuran كمحتوى YouTube مدمج.',
    en: 'Quran recitation videos from tvQuran as nested YouTube content.',
    de: 'Koranrezitationsvideos von tvQuran als eingebettete YouTube-Inhalte.'
  },
  'prayer-videos': {
    ar: 'تلاوات مرئية من الصلاة من tvQuran كمحتوى YouTube مدمج.',
    en: 'Prayer recitation videos from tvQuran as nested YouTube content.',
    de: 'Gebetsrezitationen von tvQuran als eingebettete YouTube-Inhalte.'
  },
  'live-videos': {
    ar: 'بث مباشر ومرئيات مباشرة من tvQuran كمحتوى YouTube مدمج.',
    en: 'Live broadcast videos from tvQuran as nested YouTube content.',
    de: 'Live-Sendungen von tvQuran als eingebettete YouTube-Inhalte.'
  }
}

const RECITER_SORTS = [
  { id: 'most-played', name: { ar: 'الأكثر استماعاً', en: 'Most played', de: 'Meistgespielt' } },
  { id: 'new', name: { ar: 'الأحدث', en: 'Newest', de: 'Neueste' } },
  { id: 'narration', name: { ar: 'حسب الرواية', en: 'Narration', de: 'Überlieferung' } }
]

const SURAHS = [
  { id: 1, name: { ar: 'الفاتحة', en: 'Al-Fatihah', de: 'Al-Fatihah' } },
  { id: 2, name: { ar: 'البقرة', en: 'Al-Baqarah', de: 'Al-Baqarah' } },
  { id: 3, name: { ar: 'آل عمران', en: 'Al-Imran', de: 'Al-Imran' } },
  { id: 4, name: { ar: 'النساء', en: 'An-Nisa', de: 'An-Nisa' } },
  { id: 5, name: { ar: 'المائدة', en: 'Al-Ma’idah', de: 'Al-Ma’idah' } },
  { id: 6, name: { ar: 'الأنعام', en: 'Al-An’am', de: 'Al-An’am' } },
  { id: 7, name: { ar: 'الأعراف', en: 'Al-A’raf', de: 'Al-A’raf' } },
  { id: 8, name: { ar: 'الأنفال', en: 'Al-Anfal', de: 'Al-Anfal' } },
  { id: 9, name: { ar: 'التوبة', en: 'At-Tawbah', de: 'At-Tawbah' } },
  { id: 10, name: { ar: 'يونس', en: 'Yunus', de: 'Yunus' } },
  { id: 11, name: { ar: 'هود', en: 'Hud', de: 'Hud' } },
  { id: 12, name: { ar: 'يوسف', en: 'Yusuf', de: 'Yusuf' } },
  { id: 13, name: { ar: 'الرعد', en: 'Ar-Ra’d', de: 'Ar-Ra’d' } },
  { id: 14, name: { ar: 'إبراهيم', en: 'Ibrahim', de: 'Ibrahim' } },
  { id: 15, name: { ar: 'الحجر', en: 'Al-Hijr', de: 'Al-Hijr' } },
  { id: 16, name: { ar: 'النحل', en: 'An-Nahl', de: 'An-Nahl' } },
  { id: 17, name: { ar: 'الإسراء', en: 'Al-Isra', de: 'Al-Isra' } },
  { id: 18, name: { ar: 'الكهف', en: 'Al-Kahf', de: 'Al-Kahf' } },
  { id: 19, name: { ar: 'مريم', en: 'Maryam', de: 'Maryam' } },
  { id: 20, name: { ar: 'طه', en: 'Taha', de: 'Taha' } },
  { id: 21, name: { ar: 'الأنبياء', en: 'Al-Anbiya', de: 'Al-Anbiya' } },
  { id: 22, name: { ar: 'الحج', en: 'Al-Hajj', de: 'Al-Hajj' } },
  { id: 23, name: { ar: 'المؤمنون', en: 'Al-Mu’minun', de: 'Al-Mu’minun' } },
  { id: 24, name: { ar: 'النور', en: 'An-Nur', de: 'An-Nur' } },
  { id: 25, name: { ar: 'الفرقان', en: 'Al-Furqan', de: 'Al-Furqan' } },
  { id: 26, name: { ar: 'الشعراء', en: 'Ash-Shu’ara', de: 'Ash-Shu’ara' } },
  { id: 27, name: { ar: 'النمل', en: 'An-Naml', de: 'An-Naml' } },
  { id: 28, name: { ar: 'القصص', en: 'Al-Qasas', de: 'Al-Qasas' } },
  { id: 29, name: { ar: 'العنكبوت', en: 'Al-Ankabut', de: 'Al-Ankabut' } },
  { id: 30, name: { ar: 'الروم', en: 'Ar-Rum', de: 'Ar-Rum' } },
  { id: 31, name: { ar: 'لقمان', en: 'Luqman', de: 'Luqman' } },
  { id: 32, name: { ar: 'السجدة', en: 'As-Sajdah', de: 'As-Sajdah' } },
  { id: 33, name: { ar: 'الأحزاب', en: 'Al-Ahzab', de: 'Al-Ahzab' } },
  { id: 34, name: { ar: 'سبأ', en: 'Saba', de: 'Saba' } },
  { id: 35, name: { ar: 'فاطر', en: 'Fatir', de: 'Fatir' } },
  { id: 36, name: { ar: 'يس', en: 'Ya-Sin', de: 'Ya-Sin' } },
  { id: 37, name: { ar: 'الصافات', en: 'As-Saffat', de: 'As-Saffat' } },
  { id: 38, name: { ar: 'ص', en: 'Sad', de: 'Sad' } },
  { id: 39, name: { ar: 'الزمر', en: 'Az-Zumar', de: 'Az-Zumar' } },
  { id: 40, name: { ar: 'غافر', en: 'Ghafir', de: 'Ghafir' } },
  { id: 41, name: { ar: 'فصلت', en: 'Fussilat', de: 'Fussilat' } },
  { id: 42, name: { ar: 'الشورى', en: 'Ash-Shura', de: 'Ash-Shura' } },
  { id: 43, name: { ar: 'الزخرف', en: 'Az-Zukhruf', de: 'Az-Zukhruf' } },
  { id: 44, name: { ar: 'الدخان', en: 'Ad-Dukhan', de: 'Ad-Dukhan' } },
  { id: 45, name: { ar: 'الجاثية', en: 'Al-Jathiyah', de: 'Al-Jathiyah' } },
  { id: 46, name: { ar: 'الأحقاف', en: 'Al-Ahqaf', de: 'Al-Ahqaf' } },
  { id: 47, name: { ar: 'محمد', en: 'Muhammad', de: 'Muhammad' } },
  { id: 48, name: { ar: 'الفتح', en: 'Al-Fath', de: 'Al-Fath' } },
  { id: 49, name: { ar: 'الحجرات', en: 'Al-Hujurat', de: 'Al-Hujurat' } },
  { id: 50, name: { ar: 'ق', en: 'Qaf', de: 'Qaf' } },
  { id: 51, name: { ar: 'الذاريات', en: 'Adh-Dhariyat', de: 'Adh-Dhariyat' } },
  { id: 52, name: { ar: 'الطور', en: 'At-Tur', de: 'At-Tur' } },
  { id: 53, name: { ar: 'النجم', en: 'An-Najm', de: 'An-Najm' } },
  { id: 54, name: { ar: 'القمر', en: 'Al-Qamar', de: 'Al-Qamar' } },
  { id: 55, name: { ar: 'الرحمن', en: 'Ar-Rahman', de: 'Ar-Rahman' } },
  { id: 56, name: { ar: 'الواقعة', en: 'Al-Waqi’ah', de: 'Al-Waqi’ah' } },
  { id: 57, name: { ar: 'الحديد', en: 'Al-Hadid', de: 'Al-Hadid' } },
  { id: 58, name: { ar: 'المجادلة', en: 'Al-Mujadilah', de: 'Al-Mujadilah' } },
  { id: 59, name: { ar: 'الحشر', en: 'Al-Hashr', de: 'Al-Hashr' } },
  { id: 60, name: { ar: 'الممتحنة', en: 'Al-Mumtahanah', de: 'Al-Mumtahanah' } },
  { id: 61, name: { ar: 'الصف', en: 'As-Saff', de: 'As-Saff' } },
  { id: 62, name: { ar: 'الجمعة', en: 'Al-Jumu’ah', de: 'Al-Jumu’ah' } },
  { id: 63, name: { ar: 'المنافقون', en: 'Al-Munafiqun', de: 'Al-Munafiqun' } },
  { id: 64, name: { ar: 'التغابن', en: 'At-Taghabun', de: 'At-Taghabun' } },
  { id: 65, name: { ar: 'الطلاق', en: 'At-Talaq', de: 'At-Talaq' } },
  { id: 66, name: { ar: 'التحريم', en: 'At-Tahrim', de: 'At-Tahrim' } },
  { id: 67, name: { ar: 'الملك', en: 'Al-Mulk', de: 'Al-Mulk' } },
  { id: 68, name: { ar: 'القلم', en: 'Al-Qalam', de: 'Al-Qalam' } },
  { id: 69, name: { ar: 'الحاقة', en: 'Al-Haqqah', de: 'Al-Haqqah' } },
  { id: 70, name: { ar: 'المعارج', en: 'Al-Ma’arij', de: 'Al-Ma’arij' } },
  { id: 71, name: { ar: 'نوح', en: 'Nuh', de: 'Nuh' } },
  { id: 72, name: { ar: 'الجن', en: 'Al-Jinn', de: 'Al-Jinn' } },
  { id: 73, name: { ar: 'المزمل', en: 'Al-Muzzammil', de: 'Al-Muzzammil' } },
  { id: 74, name: { ar: 'المدثر', en: 'Al-Muddaththir', de: 'Al-Muddaththir' } },
  { id: 75, name: { ar: 'القيامة', en: 'Al-Qiyamah', de: 'Al-Qiyamah' } },
  { id: 76, name: { ar: 'الإنسان', en: 'Al-Insan', de: 'Al-Insan' } },
  { id: 77, name: { ar: 'المرسلات', en: 'Al-Mursalat', de: 'Al-Mursalat' } },
  { id: 78, name: { ar: 'النبأ', en: 'An-Naba', de: 'An-Naba' } },
  { id: 79, name: { ar: 'النازعات', en: 'An-Nazi’at', de: 'An-Nazi’at' } },
  { id: 80, name: { ar: 'عبس', en: 'Abasa', de: 'Abasa' } },
  { id: 81, name: { ar: 'التكوير', en: 'At-Takwir', de: 'At-Takwir' } },
  { id: 82, name: { ar: 'الانفطار', en: 'Al-Infitar', de: 'Al-Infitar' } },
  { id: 83, name: { ar: 'المطففين', en: 'Al-Mutaffifin', de: 'Al-Mutaffifin' } },
  { id: 84, name: { ar: 'الانشقاق', en: 'Al-Inshiqaq', de: 'Al-Inshiqaq' } },
  { id: 85, name: { ar: 'البروج', en: 'Al-Buruj', de: 'Al-Buruj' } },
  { id: 86, name: { ar: 'الطارق', en: 'At-Tariq', de: 'At-Tariq' } },
  { id: 87, name: { ar: 'الأعلى', en: 'Al-A’la', de: 'Al-A’la' } },
  { id: 88, name: { ar: 'الغاشية', en: 'Al-Ghashiyah', de: 'Al-Ghashiyah' } },
  { id: 89, name: { ar: 'الفجر', en: 'Al-Fajr', de: 'Al-Fajr' } },
  { id: 90, name: { ar: 'البلد', en: 'Al-Balad', de: 'Al-Balad' } },
  { id: 91, name: { ar: 'الشمس', en: 'Ash-Shams', de: 'Ash-Shams' } },
  { id: 92, name: { ar: 'الليل', en: 'Al-Layl', de: 'Al-Layl' } },
  { id: 93, name: { ar: 'الضحى', en: 'Ad-Duha', de: 'Ad-Duha' } },
  { id: 94, name: { ar: 'الشرح', en: 'Ash-Sharh', de: 'Ash-Sharh' } },
  { id: 95, name: { ar: 'التين', en: 'At-Tin', de: 'At-Tin' } },
  { id: 96, name: { ar: 'العلق', en: 'Al-Alaq', de: 'Al-Alaq' } },
  { id: 97, name: { ar: 'القدر', en: 'Al-Qadr', de: 'Al-Qadr' } },
  { id: 98, name: { ar: 'البينة', en: 'Al-Bayyinah', de: 'Al-Bayyinah' } },
  { id: 99, name: { ar: 'الزلزلة', en: 'Az-Zalzalah', de: 'Az-Zalzalah' } },
  { id: 100, name: { ar: 'العاديات', en: 'Al-Adiyat', de: 'Al-Adiyat' } },
  { id: 101, name: { ar: 'القارعة', en: 'Al-Qari’ah', de: 'Al-Qari’ah' } },
  { id: 102, name: { ar: 'التكاثر', en: 'At-Takathur', de: 'At-Takathur' } },
  { id: 103, name: { ar: 'العصر', en: 'Al-Asr', de: 'Al-Asr' } },
  { id: 104, name: { ar: 'الهمزة', en: 'Al-Humazah', de: 'Al-Humazah' } },
  { id: 105, name: { ar: 'الفيل', en: 'Al-Fil', de: 'Al-Fil' } },
  { id: 106, name: { ar: 'قريش', en: 'Quraysh', de: 'Quraysh' } },
  { id: 107, name: { ar: 'الماعون', en: 'Al-Ma’un', de: 'Al-Ma’un' } },
  { id: 108, name: { ar: 'الكوثر', en: 'Al-Kawthar', de: 'Al-Kawthar' } },
  { id: 109, name: { ar: 'الكافرون', en: 'Al-Kafirun', de: 'Al-Kafirun' } },
  { id: 110, name: { ar: 'النصر', en: 'An-Nasr', de: 'An-Nasr' } },
  { id: 111, name: { ar: 'المسد', en: 'Al-Masad', de: 'Al-Masad' } },
  { id: 112, name: { ar: 'الإخلاص', en: 'Al-Ikhlas', de: 'Al-Ikhlas' } },
  { id: 113, name: { ar: 'الفلق', en: 'Al-Falaq', de: 'Al-Falaq' } },
  { id: 114, name: { ar: 'الناس', en: 'An-Nas', de: 'An-Nas' } }
]

const VIDEO_CATEGORIES = [
  {
    id: 11,
    type: 'videos',
    name: { ar: 'فيديو التلاوات', en: 'Videos', de: 'Videos' },
    slug: { ar: '%D9%81%D9%8A%D8%AF%D9%8A%D9%88-%D8%A7%D9%84%D8%AA%D9%84%D8%A7%D9%88%D8%A7%D8%AA', en: 'videos', de: 'videos' }
  },
  {
    id: 15,
    type: 'prayer-videos',
    name: { ar: 'تلاوات من الصلاة', en: 'Prayer recitations', de: 'Rezitationen aus dem Gebet' },
    slug: {
      ar: '%D8%AA%D9%84%D8%A7%D9%88%D8%A7%D8%AA-%D9%85%D9%86-%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9',
      en: 'prayer-recitations',
      de: 'rezitationen-aus-dem-gebet'
    }
  },
  {
    id: 16,
    type: 'live-videos',
    name: { ar: 'البث المباشر', en: 'Live broadcast', de: 'Live-Sendung' },
    slug: { ar: '%D8%A7%D9%84%D8%A8%D8%AB-%D8%A7%D9%84%D9%85%D8%A8%D8%A7%D8%B4%D8%B1', en: 'live-broadcast', de: 'live-sendung' }
  }
]

const LABELS = {
  ar: {
    content: 'المحتوى',
    selections: 'المختارات',
    recitations: 'تلاوات القراء',
    videos: 'المرئيات',
    prayerVideos: 'تلاوات من الصلاة',
    liveVideos: 'البث المباشر',
    category: 'التصنيف',
    reciter: 'القارئ',
    surah: 'السورة',
    collection: 'المصحف',
    provider: 'المزود',
    source: 'المصدر',
    page: 'الصفحة'
  },
  en: {
    content: 'Content',
    selections: 'Selections',
    recitations: 'Reciter recitations',
    videos: 'Videos',
    prayerVideos: 'Prayer recitations',
    liveVideos: 'Live videos',
    category: 'Category',
    reciter: 'Reciter',
    surah: 'Surah',
    collection: 'Collection',
    provider: 'Provider',
    source: 'Source',
    page: 'Page'
  },
  de: {
    content: 'Inhalt',
    selections: 'Sammlungen',
    recitations: 'Rezitator-Rezitationen',
    videos: 'Videos',
    prayerVideos: 'Rezitationen aus dem Gebet',
    liveVideos: 'Live-Sendung',
    category: 'Kategorie',
    reciter: 'Rezitator',
    surah: 'Sure',
    collection: 'Sammlung',
    provider: 'Anbieter',
    source: 'Quelle',
    page: 'Seite'
  }
}

const REGEX = {
  ROOT_CHANNEL: /^https?:\/\/(?:www\.)?tvquran\.com(?:\/)?$/,
  CATEGORY_CHANNEL: /^tvquran:\/\/category\/(\d+)$/,
  VIDEO_CHANNEL: /^tvquran:\/\/video-category\/([^/?#]+)$/,
  RECITER_CHANNEL: /^tvquran:\/\/reciter\/(\d+)(?:\/([^/?#]+))?$/,
  COLLECTION_CHANNEL: /^tvquran:\/\/collection\/(\d+)(?:\/([^/?#]+))?$/,
  CATEGORY_PLAYLIST: /^tvquran:\/\/playlist\/category\/(\d+)$/,
  COLLECTION_PLAYLIST: /^tvquran:\/\/playlist\/collection\/(\d+)(?:\/([^/?#]+))?$/,
  WEB_CATEGORY: /^https?:\/\/(?:www\.)?tvquran\.com\/[a-z]{2}\/selections\/category\/(\d+)/,
  WEB_VIDEO_CATEGORY: /^https?:\/\/(?:www\.)?tvquran\.com\/[a-z]{2}\/videos\/category\/(\d+)/,
  WEB_RECITER: /^https?:\/\/(?:www\.)?tvquran\.com\/[a-z]{2}\/scholar\/(\d+)\/profile(?:\/([^/?#]+))?/,
  WEB_COLLECTION: /^https?:\/\/(?:www\.)?tvquran\.com\/[a-z]{2}\/collection\/(\d+)(?:\/([^/?#]+))?/,
  SELECTION: /^tvquran:\/\/selection\/(\d+)$/,
  RECITATION: /^tvquran:\/\/recitation\/(\d+)$/,
  VIDEO: /^tvquran:\/\/video\/(\d+)$/,
  WEB_SELECTION: /^https?:\/\/(?:www\.)?tvquran\.com\/[a-z]{2}\/selection\/(\d+)/,
  WEB_RECITATION: /^https?:\/\/(?:www\.)?tvquran\.com\/[a-z]{2}\/recitation\/(\d+)/,
  WEB_VIDEO: /^https?:\/\/(?:www\.)?tvquran\.com\/[a-z]{2}\/video\/(\d+)/
}

let _config = {}
let _settings = {}
const grayjay = grayjay_platform(PLATFORM, () => _config.id)
let state = {}

source.enable = function (conf, settings, savedState) {
  _config = conf ?? {}
  _settings = settings ?? {}

  if (savedState) {
    try {
      state = JSON.parse(savedState)
    } catch (e) {
      logIfTesting('Failed to parse tvQuran state: ' + e)
    }
  }

  const currentLanguage = language()
  if (state.language !== currentLanguage) {
    resetCaches()
    state.language = currentLanguage
  }

  initCaches()
}

source.saveState = function () {
  return JSON.stringify(state)
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function staticThumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

source.getHome = function () {
  const homeMode = String(_settings.homeMode ?? '0')
  if (homeMode === '1') {
    return tvVideosPager('videos')
  }
  if (homeMode === '2') {
    return tvVideosPager('live-videos')
  }
  if (homeMode === '3') {
    return new TvQuranReciterHomePager()
  }
  if (homeMode === '4') {
    return tvVideosPager('prayer-videos')
  }

  const category = CATEGORIES[Number(_settings.homeCategory ?? 0)] ?? CATEGORIES[0]
  return new TvQuranPager(categoryUrl(category.id, 1, homeSelectionView()), { categoryId: category.id, page: 2, view: homeSelectionView() })
}

Type.Order.Popularity = 'Popularity'

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological, Type.Order.Popularity],
  filters: [contentFilter(), categoryFilter(), reciterFilter(), surahFilter()]
})

source.searchSuggestions = function (query) {
  const q = normalize(query)
  if (!q) {
    return []
  }

  const suggestions = [
    text('selections'),
    text('recitations'),
    text('videos'),
    text('prayerVideos'),
    text('liveVideos'),
    ...CATEGORIES.map(categoryName),
    ...VIDEO_CATEGORIES.map(videoCategoryName),
    ...SELECTION_SORTS.map((sort) => localized(sort.name)),
    ...RECITER_SORTS.map((sort) => localized(sort.name)),
    ...SURAHS.map(surahFilterLabel),
    ...Object.values(state.reciterCache ?? {}).map((reciter) => reciter.name),
    ...Object.values(state.reciterCache ?? {}).flatMap((reciter) => (reciter.collections ?? []).map((collection) => collection.title))
  ].filter((name) => normalize(name).indexOf(q) >= 0)

  if (q.length >= 2) {
    try {
      const reciters = reciterSearchResults(query)
      suggestions.push(...reciters.map((reciter) => reciter.name))
      suggestions.push(
        ...reciters
          .filter((reciter) => reciter.collections?.length)
          .flatMap((reciter) => reciter.collections.map((collection) => collection.title))
      )
    } catch (e) {
      logIfTesting('Failed to load tvQuran reciter suggestions: ' + e)
    }
  }

  return dedupeStrings(suggestions).slice(0, DEFAULT_LIMIT)
}

source.search = function (query, type, order, filters) {
  const q = normalize(query)
  if (!q && !hasSearchFilters(filters)) {
    return source.getHome()
  }

  return new TvQuranSearchPager(query, order, filters)
}

source.searchChannels = function (query) {
  const q = normalize(query)
  const categoryChannels = CATEGORIES.filter((category) => !q || normalize(categoryName(category)).indexOf(q) >= 0).map(categoryToChannel)
  const videoChannels = VIDEO_CATEGORIES.filter((category) => !q || normalize(videoCategoryName(category)).indexOf(q) >= 0).map(
    videoCategoryToChannel
  )

  return new TvQuranChannelPager(query, 1, [...categoryChannels, ...videoChannels])
}

source.searchPlaylists = function (query, type, order, filters) {
  return new ArrayPlaylistPager(tvQuranPlaylists(query, order, filters), DEFAULT_LIMIT)
}

source.isChannelUrl = function (url) {
  return (
    REGEX.ROOT_CHANNEL.test(url) ||
    REGEX.CATEGORY_CHANNEL.test(url) ||
    REGEX.WEB_CATEGORY.test(url) ||
    REGEX.VIDEO_CHANNEL.test(url) ||
    REGEX.WEB_VIDEO_CATEGORY.test(url) ||
    REGEX.RECITER_CHANNEL.test(url) ||
    REGEX.WEB_RECITER.test(url) ||
    REGEX.COLLECTION_CHANNEL.test(url) ||
    REGEX.WEB_COLLECTION.test(url)
  )
}

source.getChannel = function (url) {
  if (REGEX.ROOT_CHANNEL.test(url)) {
    return rootChannel()
  }

  if (REGEX.CATEGORY_CHANNEL.test(url) || REGEX.WEB_CATEGORY.test(url)) {
    return categoryToChannel(getCategoryFromUrl(url), true)
  }

  if (REGEX.VIDEO_CHANNEL.test(url) || REGEX.WEB_VIDEO_CATEGORY.test(url)) {
    return videoCategoryToChannel(getVideoCategoryFromUrl(url), true)
  }

  if (REGEX.COLLECTION_CHANNEL.test(url) || REGEX.WEB_COLLECTION.test(url)) {
    return collectionToChannel(getCollectionFromUrl(url))
  }

  return reciterToChannel(getReciterFromUrl(url))
}

source.isPlaylistUrl = function (url) {
  return (
    REGEX.CATEGORY_PLAYLIST.test(url) ||
    REGEX.WEB_CATEGORY.test(url) ||
    REGEX.COLLECTION_PLAYLIST.test(url) ||
    REGEX.COLLECTION_CHANNEL.test(url) ||
    REGEX.WEB_COLLECTION.test(url)
  )
}

source.getPlaylist = function (url) {
  return getTvQuranPlaylist(url)
}

source.getChannelPlaylists = function (url) {
  if (REGEX.ROOT_CHANNEL.test(url)) {
    return new ArrayPlaylistPager(tvQuranPlaylists('', Type.Order.Chronological, null), DEFAULT_LIMIT)
  }

  if (REGEX.CATEGORY_CHANNEL.test(url) || REGEX.WEB_CATEGORY.test(url)) {
    return new ArrayPlaylistPager([categoryToPlaylist(getCategoryFromUrl(url), true)], DEFAULT_LIMIT)
  }

  if (REGEX.VIDEO_CHANNEL.test(url) || REGEX.WEB_VIDEO_CATEGORY.test(url)) {
    return new ArrayPlaylistPager([], DEFAULT_LIMIT)
  }

  if (REGEX.COLLECTION_CHANNEL.test(url) || REGEX.WEB_COLLECTION.test(url)) {
    return new ArrayPlaylistPager([collectionToPlaylist(getCollectionFromUrl(url))], DEFAULT_LIMIT)
  }

  return new ArrayPlaylistPager(reciterCollectionPlaylists(getReciterFromUrl(url)), DEFAULT_LIMIT)
}

source.getSearchChannelContentsCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological, Type.Order.Popularity],
  filters: [reciterFilter(), surahFilter()]
})

source.getPeekChannelTypes = () => [text('selections'), text('recitations'), text('videos'), text('prayerVideos'), text('liveVideos')]

source.peekChannelContents = function (url, _type) {
  if (REGEX.ROOT_CHANNEL.test(url)) {
    return source.getHome().results.slice(0, 6)
  }

  if (REGEX.CATEGORY_CHANNEL.test(url) || REGEX.WEB_CATEGORY.test(url)) {
    const category = getCategoryFromUrl(url)
    return parseSelections(callHtml(categoryUrl(category.id, 1, homeSelectionView())))
      .slice(0, 6)
      .map(selectionToVideo)
  }

  if (REGEX.VIDEO_CHANNEL.test(url) || REGEX.WEB_VIDEO_CATEGORY.test(url)) {
    const category = getVideoCategoryFromUrl(url)
    return parseTvVideos(callHtml(videoCategoryUrl(category.type, 1)), category.type)
      .slice(0, 6)
      .map(tvVideoToNested)
  }

  if (REGEX.COLLECTION_CHANNEL.test(url) || REGEX.WEB_COLLECTION.test(url)) {
    return collectionContentVideos(getCollectionFromUrl(url), '', null).slice(0, 6)
  }

  return reciterContentVideos(getReciterFromUrl(url), '', null).slice(0, 6)
}

source.searchChannelContents = function (channelUrlValue, query, type, order, filters) {
  if (REGEX.ROOT_CHANNEL.test(channelUrlValue)) {
    return source.search(query, type, order, filters)
  }

  const q = normalize(query)

  if (REGEX.CATEGORY_CHANNEL.test(channelUrlValue) || REGEX.WEB_CATEGORY.test(channelUrlValue)) {
    const category = getCategoryFromUrl(channelUrlValue)
    return new TvQuranChannelSearchPager('category', category.id, query, order, filters)
  }

  if (REGEX.VIDEO_CHANNEL.test(channelUrlValue) || REGEX.WEB_VIDEO_CATEGORY.test(channelUrlValue)) {
    return new TvQuranChannelSearchPager('video', getVideoCategoryFromUrl(channelUrlValue).type, query, order, filters)
  }

  if (REGEX.COLLECTION_CHANNEL.test(channelUrlValue) || REGEX.WEB_COLLECTION.test(channelUrlValue)) {
    return new ArrayVideoPager(collectionContentVideos(getCollectionFromUrl(channelUrlValue), q, filters), DEFAULT_LIMIT)
  }

  return new ArrayVideoPager(reciterContentVideos(getReciterFromUrl(channelUrlValue), q, filters), DEFAULT_LIMIT)
}

source.getChannelContents = function (url, type, order, filters) {
  if (REGEX.ROOT_CHANNEL.test(url)) {
    return source.getHome()
  }

  if (REGEX.CATEGORY_CHANNEL.test(url) || REGEX.WEB_CATEGORY.test(url)) {
    const category = getCategoryFromUrl(url)
    const view = selectionViewFromOrder(order)
    return new TvQuranPager(categoryUrl(category.id, 1, view), { categoryId: category.id, page: 2, view })
  }

  if (REGEX.VIDEO_CHANNEL.test(url) || REGEX.WEB_VIDEO_CATEGORY.test(url)) {
    return tvVideosPager(getVideoCategoryFromUrl(url).type)
  }

  if (REGEX.COLLECTION_CHANNEL.test(url) || REGEX.WEB_COLLECTION.test(url)) {
    return new ArrayVideoPager(collectionContentVideos(getCollectionFromUrl(url), '', filters), DEFAULT_LIMIT)
  }

  return new ArrayVideoPager(reciterContentVideos(getReciterFromUrl(url), '', filters), DEFAULT_LIMIT)
}

source.isContentDetailsUrl = function (url) {
  return (
    REGEX.SELECTION.test(url) ||
    REGEX.WEB_SELECTION.test(url) ||
    REGEX.RECITATION.test(url) ||
    REGEX.WEB_RECITATION.test(url) ||
    REGEX.VIDEO.test(url) ||
    REGEX.WEB_VIDEO.test(url)
  )
}

source.getContentDetails = function (url) {
  if (REGEX.VIDEO.test(url) || REGEX.WEB_VIDEO.test(url)) {
    return getTvVideoDetails(extractTvVideoId(url))
  }

  if (REGEX.RECITATION.test(url) || REGEX.WEB_RECITATION.test(url)) {
    return getRecitationDetails(extractRecitationId(url))
  }

  const id = extractSelectionId(url)
  if (!id) {
    throw new ScriptException('Unsupported tvQuran URL')
  }

  if (state.selectionCache[id]) {
    return selectionToVideo(state.selectionCache[id])
  }

  const html = callHtml(`${BASE_URL}/${language()}/selection/${id}`)
  const selections = parseSelections(html)
  const selection = selections.find((item) => String(item.id) === String(id)) ?? selections[0]

  if (!selection) {
    throw new ScriptException('Selection not found')
  }

  cacheSet('selectionCache', id, selection)
  return selectionToVideo(selection)
}

class TvQuranPager extends VideoPager {
  constructor(url, context) {
    const html = callHtml(url)
    const selections = parseSelections(html)
    const videos = selections.map(selectionToVideo)
    const hasMore = Boolean(context.categoryId) && pageHasMore(html)

    super(videos, hasMore, context)
  }

  nextPage() {
    if (!this.context.categoryId) {
      this.hasMore = false
      return this
    }

    const html = callHtml(categoryUrl(this.context.categoryId, this.context.page, this.context.view))
    const videos = parseSelections(html).map(selectionToVideo)
    this.results = videos
    this.hasMore = pageHasMore(html)
    this.context.page += 1
    return this
  }
}

class TvQuranSearchPager extends VideoPager {
  constructor(query, order, filters, page = 1) {
    const pageResult = searchPage(query, order, filters, page)
    super(pageResult.videos, pageResult.hasMore, { query, order, filters, page: page + 1 })
  }

  nextPage() {
    const next = new TvQuranSearchPager(this.context.query, this.context.order, this.context.filters, this.context.page)
    return apply_pager_state(this, next)
  }
}

class TvQuranChannelSearchPager extends VideoPager {
  constructor(kind, value, query, order, filters, page = 1) {
    const pageResult = channelSearchPage(kind, value, query, order, filters, page)
    super(pageResult.videos, pageResult.hasMore, { kind, value, query, order, filters, page: page + 1 })
  }

  nextPage() {
    const next = new TvQuranChannelSearchPager(
      this.context.kind,
      this.context.value,
      this.context.query,
      this.context.order,
      this.context.filters,
      this.context.page
    )
    return apply_pager_state(this, next)
  }
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)

class TvQuranChannelPager extends ChannelPager {
  constructor(query, page = 1, categories = []) {
    const html = callHtml(reciterSearchUrl(query, page))
    const reciterChannels = parseReciterCards(html).map(reciterToChannel)
    const channels = dedupeChannels([...categories, ...reciterChannels])

    super(channels, hasLoadMore(html), { query, page: page + 1 })
  }

  nextPage() {
    const next = new TvQuranChannelPager(this.context.query, this.context.page, [])
    return apply_pager_state(this, next)
  }
}

class TvQuranVideoPager extends VideoPager {
  constructor(videoType, page = 1) {
    const html = callHtml(videoCategoryUrl(videoType, page))
    const videos = parseTvVideos(html, videoType).map(tvVideoToNested)

    super(videos, pageHasMore(html), { videoType, page: page + 1 })
  }

  nextPage() {
    const next = new TvQuranVideoPager(this.context.videoType, this.context.page)
    return apply_pager_state(this, next)
  }
}

class TvQuranReciterHomePager extends VideoPager {
  constructor(page = 1) {
    const pageResult = reciterSearchPage('', page)
    const videos = []

    for (const reciter of pageResult.reciters.slice(0, RECITATION_SCAN_PER_PAGE)) {
      videos.push(...reciterContentVideos(reciter, '', null).slice(0, 3))
    }

    super(dedupeVideos(videos), pageResult.hasMore, { page: page + 1 })
  }

  nextPage() {
    const next = new TvQuranReciterHomePager(this.context.page)
    return apply_pager_state(this, next)
  }
}

function parseSelections(html) {
  const selections = []
  const articleRegex = /<article[\s\S]*?id=["']playercell-(\d+)["'][\s\S]*?<\/article>/g
  let match

  while ((match = articleRegex.exec(html)) !== null) {
    const article = match[0]
    const shareId = extractFirst(article, /\/[a-z]{2}\/selection\/(\d+)/) ?? match[1]
    const audioUrl = absolutize(extractFirst(article, /data-file=["']([^"']+)["']/) ?? extractFirst(article, /href=["']([^"']+\.mp3)["']/))

    if (!audioUrl || !/\/[a-z]{2}\/selection\//.test(article)) {
      continue
    }

    const title = cleanText(extractFirst(article, /<h3[^>]*>([\s\S]*?)<\/h3>/) ?? `Selection ${shareId}`)
    const h4 = extractFirst(article, /<h4[^>]*>([\s\S]*?)<\/h4>/) ?? ''
    const author = cleanText(
      extractFirst(h4, /<a[^>]*title=["']([^"']+)["'][^>]*>/) ?? extractFirst(h4, /<a[^>]*>([\s\S]*?)<\/a>/) ?? 'tvQuran'
    )
    const authorUrl = absolutize(extractFirst(h4, /<a[^>]*href=["']([^"']+)["']/)) ?? BASE_URL
    const category = cleanText(lastMatch(h4, /<a[^>]*>([\s\S]*?)<\/a>/g) ?? 'tvQuran')
    const thumbnail = absolutize(extractFirst(article, /<img[^>]*src=["']([^"']+)["']/)) ?? iconUrl()
    const views = Number((extractFirst(article, /fa-play[\s\S]*?<span[^>]*>([\d\s]+)<\/span>/) ?? '0').replace(/\s+/g, '')) || 0

    const selection = {
      id: shareId,
      playerId: match[1],
      title,
      author,
      authorUrl,
      category,
      thumbnail,
      audioUrl,
      views,
      pageUrl:
        absolutize(extractFirst(article, /data-url=["']([^"']*\/[a-z]{2}\/selection\/\d+)["']/)) ??
        `${BASE_URL}/${language()}/selection/${shareId}`
    }

    selections.push(selection)
    cacheSet('selectionCache', shareId, selection)
  }

  return dedupeById(selections)
}

function parseReciterCards(html) {
  const reciters = []
  const itemRegex =
    /<a[^>]*href=["']([^"']*\/[a-z]{2}\/scholar\/(\d+)\/profile\/([^"']+))["'][^>]*class=["'][^"']*sheikh-item[^"']*["'][\s\S]*?<\/a>/g
  let match

  while ((match = itemRegex.exec(html)) !== null) {
    const item = match[0]
    const reciter = {
      id: String(match[2]),
      slug: match[3],
      name: cleanText(
        extractFirst(item, /<h2[^>]*>([\s\S]*?)<\/h2>/) ?? extractFirst(item, /<img[^>]*alt=["']([^"']+)["']/) ?? `Reciter ${match[2]}`
      ),
      thumbnail: absolutize(extractFirst(item, /<img[^>]*src=["']([^"']+)["']/)) ?? iconUrl(),
      pageUrl: absolutize(match[1])
    }

    reciters.push(cacheReciter(reciter))
  }

  return dedupeById(reciters)
}

function parseReciterProfile(html, fallbackUrl) {
  const canonical = extractFirst(html, /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/) ?? fallbackUrl
  const reciterMatch = canonical.match(REGEX.WEB_RECITER) ?? String(fallbackUrl ?? '').match(REGEX.WEB_RECITER)
  const details = extractFirst(html, /<div class=["']sheikh-details["'][\s\S]*?<\/div>\s*<div class=["']moshaf-group["']/) ?? html
  let reciter = cacheReciter({
    id: String(reciterMatch?.[1] ?? extractFirst(html, /\/[a-z]{2}\/scholar\/(\d+)\/profile/) ?? ''),
    slug: reciterMatch?.[2] ?? '',
    name: cleanText(
      extractFirst(details, /<h3[^>]*>([\s\S]*?)<\/h3>/) ?? extractFirst(html, /data-title=["']([^"']+)["']/) ?? 'tvQuran Reciter'
    ),
    thumbnail: absolutize(extractFirst(details, /<img[^>]*src=["']([^"']+)["']/)) ?? iconUrl(),
    description: cleanText(extractFirst(details, /<div id=["']scholarBiography["'][^>]*>([\s\S]*?)<\/div>/) ?? ''),
    pageUrl: canonical
  })

  const profileCollections = parseReciterProfileCollections(html, reciter)
  if (profileCollections.collections.length) {
    reciter = cacheReciter({
      ...reciter,
      collections: profileCollections.collections,
      description: [reciter.description, collectionSummary(profileCollections.collections)].filter(Boolean).join('\n')
    })
  }
  const recitations = profileCollections.recitations.length
    ? profileCollections.recitations.map((recitation) => ({ ...recitation, reciter }))
    : parseRecitations(html, reciter)
  cacheSet('reciterContentsCache', reciter.id, recitations)

  return { reciter, recitations }
}

function parseReciterProfileCollections(html, reciter) {
  const titleRegex = /<div class=["']moshaf-title["'][\s\S]*?(?=<div class=["']moshaf-title["']|$)/g
  const collections = []
  const recitations = []
  let match

  while ((match = titleRegex.exec(html)) !== null) {
    const section = match[0]
    const pageUrl = absolutize(extractFirst(section, /data-url=["']([^"']*\/[a-z]{2}\/collection\/\d+[^"']*)["']/))
    const id = extractFirst(pageUrl, /\/collection\/(\d+)/)
    const title = cleanText(
      extractFirst(section, /<h2[^>]*>([\s\S]*?)<\/h2>/) ?? extractFirst(section, /data-title=["']([^"']+)["']/) ?? ''
    )

    if (!id && !title) {
      continue
    }

    const collection = {
      id: String(id ?? ''),
      slug: extractFirst(pageUrl, /\/collection\/\d+\/([^/?#]+)/) ?? '',
      title: title || `tvQuran Collection ${id}`,
      pageUrl: pageUrl || ''
    }

    collections.push(collection)
    recitations.push(
      ...parseRecitations(section, reciter).map((recitation) => ({
        ...recitation,
        collectionId: collection.id,
        collectionTitle: collection.title,
        collectionUrl: collection.pageUrl
      }))
    )
  }

  return { collections: dedupeById(collections), recitations: dedupeById(recitations) }
}

function parseCollectionPage(html, fallbackUrl) {
  const canonical = extractFirst(html, /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/) ?? fallbackUrl
  const match = canonical.match(REGEX.WEB_COLLECTION) ?? String(fallbackUrl ?? '').match(REGEX.WEB_COLLECTION)
  const title = cleanText(
    extractFirst(html, /<div class=["']moshaf-title["'][\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/) ??
      extractFirst(html, /<h2[^>]*>([\s\S]*?)<\/h2>/) ??
      extractFirst(html, /data-title=["']([^"']+)["']/) ??
      `tvQuran Collection ${match?.[1] ?? ''}`
  )
  const reciterLink = extractFirst(html, /<a[^>]*href=["']([^"']*\/[a-z]{2}\/scholar\/\d+\/profile\/[^"']+)["'][^>]*title=["']([^"']+)["']/)
  const reciterUrl = absolutize(reciterLink) ?? canonical
  const reciter = cacheReciter({
    id: String(extractFirst(reciterUrl, /\/scholar\/(\d+)\/profile/) ?? extractFirst(html, /\/[a-z]{2}\/scholar\/(\d+)\/profile/) ?? ''),
    slug: extractFirst(reciterUrl, /\/profile\/([^/?#]+)/) ?? '',
    name: cleanText(
      extractFirst(html, /<a[^>]*href=["'][^"']*\/scholar\/\d+\/profile\/[^"']+["'][^>]*title=["']([^"']+)["']/) ??
        title.replace(/\s+-\s+.*$/, '') ??
        'tvQuran Reciter'
    ),
    thumbnail: absolutize(extractFirst(html, /<img[^>]*src=["']([^"']*uploads\/authors\/images\/[^"']+)["']/)) ?? iconUrl(),
    description: cleanText(extractFirst(html, /<meta name=["']description["'][^>]*content=["']([^"']+)["']/) ?? ''),
    pageUrl: reciterUrl
  })
  const recitations = parseRecitations(html, reciter).map((recitation) => ({
    ...recitation,
    collectionId: match?.[1] ?? '',
    collectionTitle: title
  }))

  return {
    id: String(match?.[1] ?? ''),
    slug: match?.[2] ?? '',
    title,
    description: cleanText(extractFirst(html, /<meta name=["']description["'][^>]*content=["']([^"']+)["']/) ?? ''),
    pageUrl: canonical,
    reciter,
    recitations
  }
}

function parseRecitations(html, reciter) {
  const recitations = []
  const articleRegex = /<article[^>]*class=["'][^"']*w-box[^"']*["'][^>]*id=["']playercell-(\d+)["'][\s\S]*?<\/article>/g
  let match

  while ((match = articleRegex.exec(html)) !== null) {
    const article = match[0]
    const audioUrl = absolutize(extractFirst(article, /data-file=["']([^"']+)["']/) ?? extractFirst(article, /href=["']([^"']+\.mp3)["']/))

    if (!audioUrl) {
      continue
    }

    const id = extractFirst(article, /\/[a-z]{2}\/recitation\/(\d+)/) ?? match[1]
    const title = cleanText(
      extractFirst(article, /<h4[^>]*>\s*<span>([\s\S]*?)<\/span>\s*<\/h4>/) ??
        extractFirst(article, /data-title=["']([^"']+)["']/) ??
        `Recitation ${id}`
    )
    const surahNumber =
      Number(cleanText(extractFirst(article, /<span[^>]*class=["'][^"']*sorah-num[^"']*["'][^>]*>([\s\S]*?)<\/span>/))) || 0
    const views = Number((extractFirst(article, /fa-play[\s\S]*?<span[^>]*>([\d\s]+)<\/span>/) ?? '0').replace(/\s+/g, '')) || 0
    const recitation = {
      id: String(id),
      playerId: match[1],
      title,
      surahNumber,
      reciter,
      thumbnail: reciter.thumbnail || iconUrl(),
      audioUrl,
      views,
      pageUrl:
        absolutize(extractFirst(article, /data-url=["']([^"']*\/[a-z]{2}\/recitation\/\d+)["']/)) ??
        `${BASE_URL}/${language()}/recitation/${id}`
    }

    recitations.push(recitation)
    cacheSet('recitationCache', recitation.id, recitation)
  }

  return dedupeById(recitations)
}

function parseTvVideos(html, videoType) {
  const videos = []
  const articleRegex = /<article[\s\S]*?<\/article>/g
  let match

  while ((match = articleRegex.exec(html)) !== null) {
    const article = match[0]
    const href =
      extractFirst(article, /<a[^>]*href=["']([^"']*\/[a-z]{2}\/video\/\d+[^"']*)["'][^>]*class=["'][^"']*vid-thumb/) ??
      extractFirst(article, /<h3[^>]*>[\s\S]*?<a[^>]*href=["']([^"']*\/[a-z]{2}\/video\/\d+[^"']*)["']/)
    const id = extractFirst(href, /\/[a-z]{2}\/video\/(\d+)/)

    if (!id) {
      continue
    }

    const title = cleanText(
      extractFirst(article, /<h3[^>]*>[\s\S]*?<a[^>]*title=["']([^"']+)["']/) ??
        extractFirst(article, /<img[^>]*alt=["']([^"']+)["']/) ??
        extractFirst(article, /<h3[^>]*>([\s\S]*?)<\/h3>/) ??
        `Video ${id}`
    )
    const thumbnail =
      absolutize(extractFirst(article, /<img[^>]*src=["']([^"']+)["']/)) ?? youtubeThumbnail(extractYoutubeId(article)) ?? iconUrl()
    const description = cleanText(extractFirst(article, /<p[^>]*class=["'][^"']*mt-?15[^"']*["'][^>]*>([\s\S]*?)<\/p>/) ?? '')
    const views = Number((extractFirst(article, /fa-play[\s\S]*?<span[^>]*>([\d\s]+)<\/span>/) ?? '0').replace(/\s+/g, '')) || 0
    const durationText = cleanText(
      extractFirst(article, /<span[^>]*class=["'][^"']*vid-duration[^"']*["'][^>]*>\s*<strong>([\s\S]*?)<\/strong>/) ?? ''
    )
    const youtubeId = extractYoutubeId(article)
    const pageUrl = absolutize(href)

    videos.push({
      id: String(id),
      title,
      thumbnail,
      description,
      views,
      durationText,
      youtubeId,
      videoType,
      pageUrl,
      contentUrl: youtubeId ? youtubeUrl(youtubeId) : pageUrl
    })
  }

  return dedupeById(videos)
}

function selectionToVideo(selection) {
  const details = grayjay.video(selection.id, {
    name: selection.title,
    thumbnails: selection.thumbnail ? thumbnails(selection.thumbnail) : staticThumbnails(),
    author: grayjay.author(
      normalize(selection.author).replace(/[^a-z0-9]+/g, '-'),
      selection.author || 'tvQuran',
      selection.authorUrl || BASE_URL,
      selection.thumbnail || iconUrl()
    ),
    uploadDate: 0,
    duration: 0,
    viewCount: selection.views || 0,
    isLive: false,
    url: selectionUrl(selection.id),
    description: [
      selection.title,
      `${text('reciter')}: ${selection.author || 'tvQuran'}`,
      `${text('category')}: ${selection.category || 'tvQuran'}`,
      `${text('source')}: ${selection.pageUrl}`
    ].join('\n'),
    video: audio_source_descriptor({ name: 'MP3 Audio', url: selection.audioUrl, language: 'ar' }),
    shareUrl: selection.pageUrl
  })

  details.getContentRecommendations = function () {
    return new TvQuranPager(
      `${BASE_URL}/${language()}/search?query=${encodeURIComponent(selection.author || selection.category || selection.title)}`,
      {}
    )
  }

  return details
}

function recitationToVideo(recitation) {
  const details = grayjay.video(`recitation-${recitation.id}`, {
    name: `${recitation.title} - ${recitation.reciter.name}`,
    thumbnails: recitation.thumbnail ? thumbnails(recitation.thumbnail) : staticThumbnails(),
    author: reciterToAuthor(recitation.reciter),
    uploadDate: 0,
    duration: 0,
    viewCount: recitation.views || 0,
    isLive: false,
    url: recitationUrl(recitation.id),
    description: [
      `${text('reciter')}: ${recitation.reciter.name}`,
      `${text('surah')}: ${recitation.title}${recitation.surahNumber ? ` (${recitation.surahNumber})` : ''}`,
      recitation.collectionTitle ? `${text('collection')}: ${recitation.collectionTitle}` : '',
      `${text('source')}: ${recitation.audioUrl}`,
      `${text('page')}: ${recitation.pageUrl}`
    ]
      .filter(Boolean)
      .join('\n'),
    video: audio_source_descriptor({ name: 'MP3 Audio', url: recitation.audioUrl, language: 'ar' }),
    shareUrl: recitation.pageUrl
  })

  details.getContentRecommendations = function () {
    return new ArrayVideoPager(
      reciterContentVideos(recitation.reciter, '').filter((video) => video.url !== details.url),
      DEFAULT_LIMIT
    )
  }

  return details
}

function tvVideoToNested(video) {
  const nested = grayjay.nested(`video-${video.id}`, {
    name: video.title,
    author: grayjay.author('tvquran-videos', 'tvQuran', videoCategoryChannelUrl(video.videoType), iconUrl()),
    datetime: 0,
    url: tvVideoUrl(video.id),
    contentUrl: video.contentUrl || video.pageUrl,
    contentName: video.title,
    contentDescription: [video.description, `${text('provider')}: YouTube`, `${text('page')}: ${video.pageUrl}`].filter(Boolean).join('\n'),
    contentProvider: 'YouTube',
    contentThumbnails: video.thumbnail ? thumbnails(video.thumbnail) : staticThumbnails()
  })

  nested.getContentRecommendations = function () {
    const pager = tvVideosPager(video.videoType)
    pager.results = pager.results.filter((item) => item.url !== nested.url)
    return pager
  }

  return nested
}

function getRecitationDetails(id) {
  if (!id) {
    throw new ScriptException('Recitation not found')
  }

  if (state.recitationCache[id]) {
    return recitationToVideo(state.recitationCache[id])
  }

  const html = callHtml(`${BASE_URL}/${language()}/recitation/${id}`)
  const profile = parseReciterProfile(html, `${BASE_URL}/${language()}/recitation/${id}`)
  const recitation = profile.recitations.find((item) => String(item.id) === String(id))

  if (!recitation) {
    throw new ScriptException('Recitation not found')
  }

  return recitationToVideo(recitation)
}

function getTvVideoDetails(id) {
  if (!id) {
    throw new ScriptException('tvQuran video not found')
  }

  const html = callHtml(`${BASE_URL}/${language()}/video/${id}`)
  const canonical =
    extractFirst(html, /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/) ?? `${BASE_URL}/${language()}/video/${id}`
  const youtubeId = extractYoutubeId(html)
  const video = {
    id: String(id),
    title: cleanText(
      extractFirst(html, /<div class=["']l-box["'][\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/) ??
        extractFirst(html, /data-title=["']([^"']+)["']/) ??
        `Video ${id}`
    ),
    thumbnail: youtubeThumbnail(youtubeId) ?? iconUrl(),
    description: cleanText(
      extractFirst(html, /<meta name=["']description["'][^>]*content=["']([^"']+)["']/) ??
        extractFirst(html, /<p[^>]*class=["'][^"']*mtb-15[^"']*["'][^>]*>([\s\S]*?)<\/p>/) ??
        ''
    ),
    views: Number((extractFirst(html, /fa-play[\s\S]*?<span[^>]*>([\d\s]+)<\/span>/) ?? '0').replace(/\s+/g, '')) || 0,
    youtubeId,
    videoType: videoTypeFromHtml(html),
    pageUrl: canonical,
    contentUrl: youtubeId ? youtubeUrl(youtubeId) : canonical
  }

  return tvVideoToNested(video)
}

function getCategoryFromUrl(url) {
  const match = url.match(REGEX.CATEGORY_CHANNEL) ?? url.match(REGEX.WEB_CATEGORY)
  const id = match?.[1]
  const category = CATEGORIES.find((c) => String(c.id) === String(id))

  if (!category) {
    throw new ScriptException('tvQuran category not found')
  }

  return category
}

function getVideoCategoryFromUrl(url) {
  const match = url.match(REGEX.VIDEO_CHANNEL) ?? url.match(REGEX.WEB_VIDEO_CATEGORY)
  const value = match?.[1]
  const category = VIDEO_CATEGORIES.find((c) => c.type === value || String(c.id) === String(value))

  if (!category) {
    throw new ScriptException('tvQuran video category not found')
  }

  return category
}

function getReciterFromUrl(url) {
  const match = url.match(REGEX.RECITER_CHANNEL) ?? url.match(REGEX.WEB_RECITER)
  const id = match?.[1]

  if (!id) {
    throw new ScriptException('tvQuran reciter not found')
  }

  if (state.reciterCache[id]) {
    return state.reciterCache[id]
  }

  return parseReciterProfile(
    callHtml(reciterProfileUrl(id, match?.[2], urlLanguage(url))),
    reciterProfileUrl(id, match?.[2], urlLanguage(url))
  ).reciter
}

function getCollectionFromUrl(url) {
  const match = url.match(REGEX.COLLECTION_CHANNEL) ?? url.match(REGEX.WEB_COLLECTION)
  const id = match?.[1]

  if (!id) {
    throw new ScriptException('tvQuran collection not found')
  }

  return parseCollectionPage(
    callHtml(collectionPageUrl(id, match?.[2], urlLanguage(url))),
    collectionPageUrl(id, match?.[2], urlLanguage(url))
  )
}

function categoryToChannel(category, enrich = false) {
  const metadata = categoryChannelMetadata('selection', category, enrich)
  return grayjay.channel(`category-${category.id}`, {
    name: categoryName(category),
    thumbnail: metadata.thumbnail || iconUrl(),
    banner: metadata.thumbnail || iconUrl(),
    description: metadata.description || categoryDescription(category),
    url: categoryChannelUrl(category.id),
    urlAlternatives: [selectionCategoryPageUrl(category)]
  })
}

function videoCategoryToChannel(category, enrich = false) {
  const metadata = categoryChannelMetadata('video', category, enrich)
  return grayjay.channel(`video-category-${category.id}`, {
    name: videoCategoryName(category),
    thumbnail: metadata.thumbnail || iconUrl(),
    banner: metadata.thumbnail || iconUrl(),
    description: metadata.description || videoCategoryDescription(category),
    url: videoCategoryChannelUrl(category.type),
    urlAlternatives: [videoCategoryPageUrl(category)]
  })
}

function collectionToChannel(collection) {
  return grayjay.channel(`collection-${collection.id}`, {
    name: collection.title,
    thumbnail: collection.reciter.thumbnail || iconUrl(),
    banner: collection.reciter.thumbnail || iconUrl(),
    description: collection.description || `${collection.title}\n${text('reciter')}: ${collection.reciter.name}`,
    url: collectionChannelUrl(collection.id, collection.slug),
    urlAlternatives: [collection.pageUrl]
  })
}

function rootChannel() {
  return grayjay.channel('root', {
    name: 'tvQuran',
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'tvQuran selections, reciter channels, playlists, direct MP3 audio, and nested video content.',
    url: BASE_URL,
    urlAlternatives: [`${BASE_URL}/${language()}`]
  })
}

function reciterToChannel(reciter) {
  return grayjay.channel(`reciter-${reciter.id}`, {
    name: reciter.name,
    thumbnail: reciter.thumbnail || iconUrl(),
    banner: reciter.thumbnail || iconUrl(),
    description: reciter.description || `tvQuran recitations by ${reciter.name}.`,
    url: reciterChannelUrl(reciter.id, reciter.slug),
    urlAlternatives: [reciter.pageUrl || reciterProfileUrl(reciter.id, reciter.slug)]
  })
}

function reciterToAuthor(reciter) {
  return grayjay.author(`reciter-${reciter.id}`, reciter.name, reciterChannelUrl(reciter.id, reciter.slug), reciter.thumbnail || iconUrl())
}

function tvQuranPlaylists(query, order, filters) {
  const q = normalize(query)
  const playlists = []

  if (contentAllowed(filters, 'selections')) {
    playlists.push(...CATEGORIES.filter((category) => categoryMatchesFilters(category, filters)).map(categoryToPlaylist))
  }

  if (contentAllowed(filters, 'recitations')) {
    playlists.push(...searchReciterCollectionPlaylists(query, filters))
  }

  return dedupePlaylists(playlists).filter((playlist) => playlistMatches(playlist, q))
}

function categoryToPlaylist(category, enrich = false) {
  const metadata = categoryChannelMetadata('selection', category, enrich)
  const thumbnail = metadata.thumbnail || iconUrl()
  return grayjay.playlist(`playlist-category-${category.id}`, {
    name: categoryName(category),
    thumbnails: thumbnails(thumbnail),
    author: tvQuranAuthor('selections', text('selections'), selectionCategoryPageUrl(category), thumbnail),
    datetime: 0,
    url: categoryPlaylistUrl(category.id),
    videoCount: 0,
    thumbnail
  })
}

function categoryToPlaylistDetails(category, order) {
  const playlist = categoryToPlaylist(category, true)
  return grayjay.playlist_details(`playlist-category-${category.id}`, {
    name: playlist.name,
    thumbnails: playlist.thumbnails,
    author: playlist.author,
    datetime: playlist.datetime,
    url: playlist.url,
    videoCount: playlist.videoCount,
    thumbnail: playlist.thumbnail,
    contents: new TvQuranPager(categoryUrl(category.id, 1, selectionViewFromOrder(order)), {
      categoryId: category.id,
      page: 2,
      view: selectionViewFromOrder(order)
    })
  })
}

function collectionToPlaylist(collection) {
  const thumbnail = collection.reciter?.thumbnail || iconUrl()
  return grayjay.playlist(`playlist-collection-${collection.id}`, {
    name: collection.title,
    thumbnails: thumbnails(thumbnail),
    author: reciterToAuthor(collection.reciter),
    datetime: 0,
    url: collectionPlaylistUrl(collection.id, collection.slug),
    videoCount: collection.recitations?.length ?? 0,
    thumbnail
  })
}

function collectionToPlaylistDetails(collection) {
  const playlist = collectionToPlaylist(collection)
  return grayjay.playlist_details(`playlist-collection-${collection.id}`, {
    name: playlist.name,
    thumbnails: playlist.thumbnails,
    author: playlist.author,
    datetime: playlist.datetime,
    url: playlist.url,
    videoCount: playlist.videoCount,
    thumbnail: playlist.thumbnail,
    contents: new ArrayVideoPager(collectionContentVideos(collection, '', null), DEFAULT_LIMIT)
  })
}

function reciterCollectionPlaylists(reciter) {
  const enrichedReciter = reciterWithCollections(reciter)
  return enrichedReciter.collections.map((collection) =>
    collectionToPlaylist({
      ...collection,
      reciter: enrichedReciter,
      recitations: (state.reciterContentsCache[enrichedReciter.id] ?? []).filter(
        (recitation) => String(recitation.collectionId) === String(collection.id)
      )
    })
  )
}

function searchReciterCollectionPlaylists(query, filters) {
  const selectedReciters = selectedFilterValues(filters, 'reciter')
  const reciters = []

  if (selectedReciters.length) {
    for (const value of selectedReciters) {
      const reciter = resolveReciterFilter(value)
      if (reciter) {
        reciters.push(reciter)
      }
    }
  } else {
    const q = normalize(query)
    const cached = Object.values(state.reciterCache ?? {}).filter((reciter) => reciter.collections?.length)
    reciters.push(...cached)

    if (q || cached.length < RECITATION_SCAN_PER_PAGE) {
      try {
        reciters.push(...reciterSearchResults(query || '').slice(0, RECITATION_SCAN_PER_PAGE))
      } catch (e) {
        logIfTesting('Failed to load tvQuran playlist reciter search: ' + e)
      }
    }
  }

  return dedupeById(reciters).flatMap(reciterCollectionPlaylists)
}

function reciterWithCollections(reciter) {
  if (reciter.collections?.length) {
    return reciter
  }

  try {
    const url = reciter.pageUrl || reciterProfileUrl(reciter.id, reciter.slug)
    return parseReciterProfile(callHtml(url), url).reciter
  } catch (e) {
    logIfTesting('Failed to load tvQuran reciter collections: ' + e)
    return { ...reciter, collections: [] }
  }
}

function getTvQuranPlaylist(url) {
  if (REGEX.CATEGORY_PLAYLIST.test(url) || REGEX.WEB_CATEGORY.test(url)) {
    return categoryToPlaylistDetails(getPlaylistCategoryFromUrl(url), Type.Order.Chronological)
  }

  if (REGEX.COLLECTION_PLAYLIST.test(url) || REGEX.COLLECTION_CHANNEL.test(url) || REGEX.WEB_COLLECTION.test(url)) {
    return collectionToPlaylistDetails(getPlaylistCollectionFromUrl(url))
  }

  throw new ScriptException('Unsupported tvQuran playlist URL')
}

function getPlaylistCategoryFromUrl(url) {
  const match = url.match(REGEX.CATEGORY_PLAYLIST) ?? url.match(REGEX.WEB_CATEGORY)
  const category = CATEGORIES.find((item) => String(item.id) === String(match?.[1]))
  if (!category) {
    throw new ScriptException('tvQuran category playlist not found')
  }
  return category
}

function getPlaylistCollectionFromUrl(url) {
  const match = url.match(REGEX.COLLECTION_PLAYLIST)
  if (match) {
    return getCollectionFromUrl(collectionChannelUrl(match[1], match[2]))
  }

  return getCollectionFromUrl(url)
}

function categoryMatchesFilters(category, filters) {
  const categoryIds = selectedFilterValues(filters, 'category').map(categoryIdFromFilter).filter(Boolean)
  return !categoryIds.length || categoryIds.indexOf(Number(category.id)) >= 0
}

function playlistMatches(playlist, query) {
  return !query || normalize(playlist.name).indexOf(query) >= 0 || normalize(playlist.author?.name).indexOf(query) >= 0
}

function tvQuranAuthor(id, name, url, thumbnail = iconUrl()) {
  return grayjay.author(id, name, url, thumbnail || iconUrl())
}

function reciterContentVideos(reciter, query, filters = null) {
  const q = normalize(query)
  const recitations =
    state.reciterContentsCache[reciter.id] ??
    parseReciterProfile(callHtml(reciter.pageUrl || reciterProfileUrl(reciter.id, reciter.slug)), reciter.pageUrl).recitations
  return recitations
    .filter((recitation) => recitationMatchesQuery(recitation, q))
    .filter((recitation) => recitationMatchesFilters(recitation, filters))
    .map(recitationToVideo)
}

function collectionContentVideos(collection, query, filters = null) {
  const q = normalize(query)
  return collection.recitations
    .filter((recitation) => recitationMatchesQuery(recitation, q))
    .filter((recitation) => recitationMatchesFilters(recitation, filters))
    .map(recitationToVideo)
}

function reciterSearchResults(query, page = 1) {
  return reciterSearchPage(query, page).reciters
}

function reciterSearchPage(query, page = 1) {
  const html = callHtml(reciterSearchUrl(query, page))
  return {
    reciters: parseReciterCards(html),
    hasMore: hasLoadMore(html)
  }
}

function reciterSearchUrl(query, page = 1) {
  const q = normalize(query)
  const url = q
    ? `${BASE_URL}/${language()}/quran/recitations/reciters-list?json=1&view=search&query=${encodeURIComponent(query)}`
    : `${BASE_URL}/${language()}/quran/recitations/reciters-list?json=1&view=${encodeURIComponent(reciterSortView())}`

  return page > 1 ? `${url}&page=${page}` : url
}

function searchPage(query, order, filters, page = 1) {
  const results = []
  let hasMore = false

  if (contentAllowed(filters, 'selections')) {
    const pageResult = searchSelectionsPage(query, order, filters, page)
    results.push(...pageResult.items)
    hasMore = hasMore || pageResult.hasMore
  }

  if (contentAllowed(filters, 'recitations')) {
    const pageResult = searchRecitationsPage(query, page, filters)
    results.push(...pageResult.items)
    hasMore = hasMore || pageResult.hasMore
  }

  if (contentAllowed(filters, 'videos')) {
    const pageResult = searchTvVideosPage(query, 'videos', page, filters)
    results.push(...pageResult.items)
    hasMore = hasMore || pageResult.hasMore
  }

  if (contentAllowed(filters, 'prayer-videos')) {
    const pageResult = searchTvVideosPage(query, 'prayer-videos', page, filters)
    results.push(...pageResult.items)
    hasMore = hasMore || pageResult.hasMore
  }

  if (contentAllowed(filters, 'live-videos')) {
    const pageResult = searchTvVideosPage(query, 'live-videos', page, filters)
    results.push(...pageResult.items)
    hasMore = hasMore || pageResult.hasMore
  }

  return { videos: dedupeVideos(results), hasMore }
}

function searchSelectionsPage(query, order, filters, page = 1) {
  const q = normalize(query)
  const categoryIds = selectedFilterValues(filters, 'category').map(categoryIdFromFilter).filter(Boolean)
  const view = selectionViewFromOrder(order)
  const selections = []
  let hasMore = false

  if (categoryIds.length) {
    for (const categoryId of categoryIds) {
      const html = callHtml(categoryUrl(categoryId, page, view))
      const parsed = parseSelections(html)
      selections.push(...parsed.filter((selection) => selectionMatches(selection, q) && selectionMatchesFilters(selection, filters)))
      hasMore = hasMore || pageHasMore(html, parsed)
    }
    return { items: selections.map(selectionToVideo), hasMore }
  }

  if (q) {
    const html = callHtml(searchUrl(query, page))
    const parsed = parseSelections(html)
    return {
      items: parsed
        .filter((selection) => selectionMatches(selection, q) && selectionMatchesFilters(selection, filters))
        .map(selectionToVideo),
      hasMore: pageHasMore(html, parsed)
    }
  }

  const category = CATEGORIES[Number(_settings.homeCategory ?? 0)] ?? CATEGORIES[0]
  const html = callHtml(categoryUrl(category.id, page, view))
  const parsed = parseSelections(html)
  return {
    items: parsed.filter((selection) => selectionMatchesFilters(selection, filters)).map(selectionToVideo),
    hasMore: pageHasMore(html, parsed)
  }
}

function searchRecitationsPage(query, page = 1, filters = null) {
  const q = normalize(query)
  const selectedReciters = selectedFilterValues(filters, 'reciter')
  if (selectedReciters.length) {
    const reciters = selectedReciters.map(resolveReciterFilter).filter(Boolean)
    const results = []
    for (const reciter of reciters) {
      results.push(...reciterContentVideos(reciter, q, filters))
    }
    return { items: results, hasMore: false }
  }

  let pageResult = reciterSearchPage(query, page)

  if (q && !pageResult.reciters.length) {
    pageResult = reciterSearchPage('', page)
  }

  const results = []
  for (const reciter of pageResult.reciters.slice(0, RECITATION_SCAN_PER_PAGE)) {
    results.push(...reciterContentVideos(reciter, q, filters))
  }

  return { items: results, hasMore: pageResult.hasMore }
}

function searchTvVideosPage(query, videoType, page = 1, filters = null) {
  const q = normalize(query)
  const category = VIDEO_CATEGORIES.find((item) => item.type === videoType) ?? VIDEO_CATEGORIES[0]
  const html = callHtml(videoCategoryUrl(category.type, page))
  const videos = parseTvVideos(html, videoType)
  return {
    items: videos
      .filter((video) => !q || normalize(video.title).indexOf(q) >= 0 || normalize(video.description).indexOf(q) >= 0)
      .filter((video) => tvVideoMatchesFilters(video, filters))
      .map(tvVideoToNested),
    hasMore: pageHasMore(html, videos)
  }
}

function channelSearchPage(kind, value, query, order, filters, page = 1) {
  if (kind === 'category') {
    const q = normalize(query)
    const html = callHtml(categoryUrl(value, page, selectionViewFromOrder(order)))
    const selections = parseSelections(html)
    return {
      videos: selections
        .filter((selection) => selectionMatches(selection, q) && selectionMatchesFilters(selection, filters))
        .map(selectionToVideo),
      hasMore: pageHasMore(html, selections)
    }
  }

  return searchTvVideosPage(query, value, page, filters)
}

function tvVideosPager(videoType) {
  return new TvQuranVideoPager(videoType)
}

function language() {
  return LANGUAGES[Number(_settings.language ?? 0)]?.code ?? 'ar'
}

function urlLanguage(url) {
  return String(url ?? '').match(/^https?:\/\/(?:www\.)?tvquran\.com\/([a-z]{2})\//)?.[1] ?? language()
}

function localized(value) {
  if (typeof value === 'string') {
    return value
  }

  return value?.[language()] ?? value?.en ?? Object.values(value ?? {})[0] ?? ''
}

function categoryName(category) {
  return localized(category.name)
}

function categorySlug(category) {
  return localized(category.slug)
}

function videoCategoryName(category) {
  return localized(category.name)
}

function videoCategorySlug(category) {
  return localized(category.slug)
}

function categoryDescription(category) {
  return localized(CATEGORY_DESCRIPTIONS[category.id]) || `tvQuran ${categoryName(category)} selections.`
}

function videoCategoryDescription(category) {
  return localized(VIDEO_CATEGORY_DESCRIPTIONS[category.type]) || `tvQuran ${videoCategoryName(category)}.`
}

function surahName(surah) {
  return localized(surah.name)
}

function surahFilterLabel(surah) {
  return `${surahName(surah)} (${surah.id})`
}

function text(key) {
  return LABELS[language()]?.[key] ?? LABELS.en[key] ?? key
}

function reciterFilterReciters() {
  const cached = Object.values(state.reciterCache ?? {})
  let firstPage = []
  try {
    firstPage = reciterSearchResults('')
  } catch (e) {
    logIfTesting('Failed to load tvQuran reciter filter options: ' + e)
  }

  return dedupeById([...cached, ...firstPage]).sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), language()))
}

function resolveReciterFilter(value) {
  const directId = reciterIdFromFilter(value)
  if (directId && state.reciterCache[String(directId)]) {
    return state.reciterCache[String(directId)]
  }

  const textValue = String(value ?? '').trim()
  const cached = reciterFilterReciters().find((reciter) => String(reciter.id) === String(directId) || reciter.name === textValue)
  if (cached) {
    return cached
  }

  const q = normalize(textValue)
  return (
    reciterSearchResults(textValue).find((reciter) => normalize(reciter.name).indexOf(q) >= 0 || q.indexOf(normalize(reciter.name)) >= 0) ??
    null
  )
}

function contentFilter() {
  return {
    id: 'content',
    name: text('content'),
    isMultiSelect: true,
    filters: [
      { id: text('selections'), name: text('selections'), value: 'selections' },
      { id: text('recitations'), name: text('recitations'), value: 'recitations' },
      { id: text('videos'), name: text('videos'), value: 'videos' },
      { id: text('prayerVideos'), name: text('prayerVideos'), value: 'prayer-videos' },
      { id: text('liveVideos'), name: text('liveVideos'), value: 'live-videos' }
    ]
  }
}

function categoryFilter() {
  return {
    id: 'category',
    name: text('category'),
    isMultiSelect: false,
    filters: CATEGORIES.map((category) => ({
      id: categoryName(category),
      name: categoryName(category),
      value: categoryName(category)
    }))
  }
}

function reciterFilter() {
  return {
    id: 'reciter',
    name: text('reciter'),
    isMultiSelect: false,
    filters: reciterFilterReciters().map((reciter) => ({
      id: reciter.name,
      name: reciter.name,
      value: reciter.name
    }))
  }
}

function surahFilter() {
  return {
    id: 'surah',
    name: text('surah'),
    isMultiSelect: false,
    filters: SURAHS.map((surah) => ({
      id: surahFilterLabel(surah),
      name: surahFilterLabel(surah),
      value: surahFilterLabel(surah)
    }))
  }
}

function hasSearchFilters(filters) {
  return (
    selectedFilterValues(filters, 'content').length > 0 ||
    selectedFilterValues(filters, 'category').length > 0 ||
    selectedFilterValues(filters, 'reciter').length > 0 ||
    selectedFilterValues(filters, 'surah').length > 0
  )
}

function contentAllowed(filters, contentType) {
  const selected = selectedFilterValues(filters, 'content')
  if (selected.length) {
    return selected.indexOf(contentType) >= 0
  }

  if (selectedFilterValues(filters, 'category').length) {
    return contentType === 'selections'
  }

  return true
}

function selectedFilterValues(filters, id) {
  if (!filters) {
    return []
  }

  let value = filters[id]
  if (value === undefined && filters.get) {
    value = filters.get(id)
  }

  if (value === undefined || value === null) {
    return []
  }

  if (!Array.isArray(value)) {
    value = [value]
  }

  return value.map(filterValue).filter(Boolean)
}

function filterValue(value) {
  if (typeof value === 'object' && value !== null) {
    return String(value.value ?? value.id ?? '')
  }

  return String(value)
}

function categoryIdFromFilter(value) {
  const directId = Number(value)
  if (directId) {
    return directId
  }

  return CATEGORIES.find((category) => Object.values(category.name).indexOf(value) >= 0 || categoryName(category) === value)?.id
}

function reciterIdFromFilter(value) {
  const textValue = String(value ?? '').trim()
  const directId = Number(textValue)
  if (directId) {
    return directId
  }

  return Number(reciterFilterReciters().find((reciter) => reciter.name === textValue)?.id)
}

function surahIdFromFilter(value) {
  const textValue = String(value ?? '').trim()
  const directId = Number(textValue)
  if (directId) {
    return directId
  }

  const trailingId = Number(textValue.match(/\((\d+)\)$/)?.[1])
  if (trailingId) {
    return trailingId
  }

  return Number(
    SURAHS.find(
      (surah) =>
        surahFilterLabel(surah) === textValue || surahName(surah) === textValue || Object.values(surah.name).indexOf(textValue) >= 0
    )?.id
  )
}

function selectionMatches(selection, query) {
  return (
    !query ||
    normalize(selection.title).indexOf(query) >= 0 ||
    normalize(selection.author).indexOf(query) >= 0 ||
    normalize(selection.category).indexOf(query) >= 0
  )
}

function selectionMatchesFilters(selection, filters) {
  const selectedReciters = selectedFilterValues(filters, 'reciter')
  const selectedSurahIds = selectedFilterValues(filters, 'surah').map(surahIdFromFilter).filter(Boolean)

  return (
    (!selectedReciters.length || selectedReciters.some((reciter) => normalize(selection.author).indexOf(normalize(reciter)) >= 0)) &&
    (!selectedSurahIds.length || selectedSurahIds.some((surahId) => textMentionsSurah(`${selection.title} ${selection.category}`, surahId)))
  )
}

function recitationMatchesFilters(recitation, filters) {
  const selectedReciterIds = selectedFilterValues(filters, 'reciter').map(reciterIdFromFilter).filter(Boolean)
  const selectedReciters = selectedFilterValues(filters, 'reciter').map(normalize)
  const selectedSurahIds = selectedFilterValues(filters, 'surah').map(surahIdFromFilter).filter(Boolean)

  return (
    ((!selectedReciterIds.length && !selectedReciters.length) ||
      selectedReciterIds.indexOf(Number(recitation.reciter.id)) >= 0 ||
      selectedReciters.indexOf(normalize(recitation.reciter.name)) >= 0) &&
    (!selectedSurahIds.length ||
      selectedSurahIds.indexOf(Number(recitation.surahNumber)) >= 0 ||
      selectedSurahIds.some((surahId) => textMentionsSurah(recitation.title, surahId)))
  )
}

function tvVideoMatchesFilters(video, filters) {
  const selectedReciters = selectedFilterValues(filters, 'reciter').map(normalize)
  const selectedSurahIds = selectedFilterValues(filters, 'surah').map(surahIdFromFilter).filter(Boolean)
  const searchableText = `${video.title} ${video.description}`

  return (
    (!selectedReciters.length || selectedReciters.some((reciter) => normalize(searchableText).indexOf(reciter) >= 0)) &&
    (!selectedSurahIds.length || selectedSurahIds.some((surahId) => textMentionsSurah(searchableText, surahId)))
  )
}

function recitationMatchesQuery(recitation, query) {
  return (
    !query ||
    normalize(recitation.reciter.name).indexOf(query) >= 0 ||
    normalize(recitation.title).indexOf(query) >= 0 ||
    normalize(recitation.collectionTitle).indexOf(query) >= 0 ||
    String(recitation.surahNumber || '').indexOf(query) >= 0
  )
}

function videoTypeFromHtml(html) {
  const categoryId = extractFirst(html, /\/videos\/category\/(\d+)\//)
  return VIDEO_CATEGORIES.find((category) => String(category.id) === String(categoryId))?.type ?? 'videos'
}

function textMentionsSurah(value, surahId) {
  const surah = SURAHS.find((item) => Number(item.id) === Number(surahId))
  const normalizedValue = normalize(value)
  const numberPattern = new RegExp(`(^|[^0-9])${surah?.id}([^0-9]|$)`)
  return (
    Boolean(surah) &&
    (numberPattern.test(normalizedValue) || Object.values(surah.name).some((name) => normalizedValue.indexOf(normalize(name)) >= 0))
  )
}

function homeSelectionView() {
  return SELECTION_SORTS[Number(_settings.homeSort ?? 0)]?.id ?? 'random'
}

function reciterSortView() {
  return RECITER_SORTS[Number(_settings.reciterSort ?? 0)]?.id ?? 'most-played'
}

function selectionViewFromOrder(order) {
  if (order === Type.Order.Chronological) {
    return 'new'
  }

  if (order === Type.Order.Popularity) {
    return 'most_listened'
  }

  return homeSelectionView()
}

function categoryUrl(id, page, view = 'random') {
  const pageParam = page > 1 ? `&page=${page}` : ''
  return `${BASE_URL}/${language()}/selections/category/${id}?json=1${pageParam}&view=${encodeURIComponent(view)}&sort=${sortDirection()}`
}

function videoCategoryUrl(typeOrId, page = 1) {
  const category = VIDEO_CATEGORIES.find((item) => item.type === typeOrId || String(item.id) === String(typeOrId)) ?? VIDEO_CATEGORIES[0]
  const pageParam = page > 1 ? `&page=${page}` : ''
  return `${BASE_URL}/${language()}/videos/category/${category.id}/${videoCategorySlug(category)}?json=1${pageParam}&view=new&sort=${sortDirection()}`
}

function selectionCategoryPageUrl(category) {
  return `${BASE_URL}/${language()}/selections/category/${category.id}/${categorySlug(category)}`
}

function videoCategoryPageUrl(category) {
  return `${BASE_URL}/${language()}/videos/category/${category.id}/${videoCategorySlug(category)}`
}

function searchUrl(query, page = 1) {
  const url = `${BASE_URL}/${language()}/search?query=${encodeURIComponent(query)}`
  return page > 1 ? `${url}&page=${page}` : url
}

function sortDirection() {
  return String(_settings.sortDirection ?? '0') === '1' ? 'asc' : 'desc'
}

function categoryChannelUrl(id) {
  return `tvquran://category/${id}`
}

function videoCategoryChannelUrl(type) {
  return `tvquran://video-category/${type}`
}

function categoryPlaylistUrl(id) {
  return `tvquran://playlist/category/${id}`
}

function collectionPlaylistUrl(id, slug) {
  return `tvquran://playlist/collection/${id}${slug ? `/${slug}` : ''}`
}

function collectionChannelUrl(id, slug) {
  return `tvquran://collection/${id}${slug ? `/${slug}` : ''}`
}

function collectionSummary(collections) {
  const names = dedupeStrings((collections ?? []).map((collection) => collection.title)).slice(0, 6)
  return names.length ? `${text('collection')}: ${names.join(', ')}` : ''
}

function reciterChannelUrl(id, slug) {
  return `tvquran://reciter/${id}${slug ? `/${slug}` : ''}`
}

function reciterProfileUrl(id, slug, lang = language()) {
  return `${BASE_URL}/${lang}/scholar/${id}/profile${slug ? `/${slug}` : ''}`
}

function collectionPageUrl(id, slug, lang = language()) {
  return `${BASE_URL}/${lang}/collection/${id}${slug ? `/${slug}` : ''}`
}

function selectionUrl(id) {
  return `tvquran://selection/${id}`
}

function recitationUrl(id) {
  return `tvquran://recitation/${id}`
}

function tvVideoUrl(id) {
  return `tvquran://video/${id}`
}

function extractSelectionId(url) {
  return (url.match(REGEX.SELECTION) ?? url.match(REGEX.WEB_SELECTION))?.[1] ?? null
}

function extractRecitationId(url) {
  return (url.match(REGEX.RECITATION) ?? url.match(REGEX.WEB_RECITATION))?.[1] ?? null
}

function extractTvVideoId(url) {
  return (url.match(REGEX.VIDEO) ?? url.match(REGEX.WEB_VIDEO))?.[1] ?? null
}

function callHtml(url) {
  return get_text(url, DEFAULT_HEADERS)
}

function categoryChannelMetadata(kind, category, enrich) {
  const cacheKey = `${kind}-${category.id}`
  const fallback = {
    description: kind === 'video' ? videoCategoryDescription(category) : categoryDescription(category),
    thumbnail: null
  }

  if (state.categoryMetadataCache?.[cacheKey]) {
    return { ...fallback, ...state.categoryMetadataCache[cacheKey] }
  }

  if (!enrich) {
    return fallback
  }

  try {
    const html = callHtml(kind === 'video' ? videoCategoryPageUrl(category) : selectionCategoryPageUrl(category))
    const items = kind === 'video' ? parseTvVideos(html, category.type) : parseSelections(html)
    const metadata = {
      description: cleanText(extractFirst(html, /<meta name=["']description["'][^>]*content=["']([^"']+)["']/)) || fallback.description,
      thumbnail: items.find((item) => item.thumbnail)?.thumbnail || fallback.thumbnail
    }
    cacheSet('categoryMetadataCache', cacheKey, metadata)
    return metadata
  } catch (e) {
    logIfTesting('Failed to load tvQuran category metadata: ' + e)
    return fallback
  }
}

function resetCaches() {
  state.selectionCache = {}
  state.reciterCache = {}
  state.recitationCache = {}
  state.reciterContentsCache = {}
  state.categoryMetadataCache = {}
  state.cacheOrder = {}
}

function initCaches() {
  init_lru_caches(state, CACHE_LIMITS)
}

function cacheSet(cacheName, key, value) {
  return cache_set(state, CACHE_LIMITS, cacheName, key, value)
}

function cacheReciter(reciter) {
  if (!reciter.id) {
    return reciter
  }

  const cached = state.reciterCache[reciter.id] ?? {}
  const updated = {
    ...cached,
    ...reciter,
    thumbnail: reciter.thumbnail || cached.thumbnail || iconUrl(),
    pageUrl: reciter.pageUrl || cached.pageUrl || reciterProfileUrl(reciter.id, reciter.slug)
  }
  return cacheSet('reciterCache', reciter.id, updated)
}

const extractFirst = extract_first
const lastMatch = last_match
const cleanText = clean_text

function absolutize(url) {
  if (!url) {
    return null
  }
  if (url.startsWith('//')) {
    return 'https:' + url
  }
  if (url.startsWith('/')) {
    return BASE_URL + url
  }
  return url
}

function hasLoadMore(html) {
  return /id=["']load-more["']/.test(String(html ?? ''))
}

function pageHasMore(html) {
  return hasLoadMore(html)
}

function extractYoutubeId(value) {
  return (
    extractFirst(value, /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/) ??
    extractFirst(value, /youtu\.be\/([a-zA-Z0-9_-]+)/) ??
    extractFirst(value, /i\.ytimg\.com\/vi\/([a-zA-Z0-9_-]+)\//)
  )
}

function youtubeUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`
}

function youtubeThumbnail(id) {
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

function dedupeById(items) {
  const seen = {}
  const deduped = []

  for (const item of items) {
    if (seen[item.id]) {
      continue
    }
    seen[item.id] = true
    deduped.push(item)
  }

  return deduped
}

function dedupeChannels(channels) {
  const seen = {}
  const deduped = []

  for (const channel of channels) {
    if (seen[channel.url]) {
      continue
    }
    seen[channel.url] = true
    deduped.push(channel)
  }

  return deduped
}

function dedupeVideos(videos) {
  const seen = {}
  const deduped = []

  for (const video of videos) {
    const key = video.url || video.name
    if (seen[key]) {
      continue
    }
    seen[key] = true
    deduped.push(video)
  }

  return deduped
}

function dedupePlaylists(playlists) {
  const seen = {}
  const deduped = []

  for (const playlist of playlists) {
    if (seen[playlist.url]) {
      continue
    }
    seen[playlist.url] = true
    deduped.push(playlist)
  }

  return deduped
}

function dedupeStrings(values) {
  const seen = {}
  const deduped = []

  for (const value of values) {
    const key = normalize(value)
    if (!key || seen[key]) {
      continue
    }
    seen[key] = true
    deduped.push(value)
  }

  return deduped
}

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
}

function logIfTesting(msg) {
  if (typeof IS_TESTING !== 'undefined' && IS_TESTING) {
    log(msg)
  }
}

log('LOADED')
