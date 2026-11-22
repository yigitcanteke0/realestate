// Vocabulary of facts the extractor can report. This is NOT a preference list:
// nothing here scores or eliminates anything until the user creates a criterion.
export const FACT_CATALOG = {
  priceMonthly: { label: 'Aylık fiyat', kind: 'number', unit: '€' },
  billsIncluded: { label: 'Faturalar dahil', kind: 'boolean' },
  furnished: { label: 'Eşyalı', kind: 'boolean' },
  type: {
    label: 'Konaklama tipi', kind: 'enum',
    options: ['single_room', 'double_room', 'bed_in_shared', 'studio', 'apartment'],
  },
  availableFrom: { label: 'Müsaitlik tarihi', kind: 'date' },
  roommates: { label: 'Ev arkadaşı sayısı', kind: 'number' },
  contract: { label: 'Sözleşme tipi', kind: 'enum', options: ['student', 'cedolare_secca', 'transitorio', '4+4', 'other'] },
  genderPref: { label: 'Cinsiyet tercihi', kind: 'enum', options: ['women_only', 'men_only', 'none_stated', 'ambiguous'] },
  address: { label: 'Adres', kind: 'text' },
  postedAt: { label: 'İlan tarihi', kind: 'date' },
  text: { label: 'İlan metni', kind: 'text' },
};

export const OPTION_LABELS = {
  single_room: 'Tek kişilik oda', double_room: 'Çift kişilik oda', bed_in_shared: 'Paylaşımlı odada yatak',
  studio: 'Stüdyo', apartment: 'Daire',
  student: 'Öğrenci kontratı', cedolare_secca: 'Cedolare secca', transitorio: 'Transitorio', '4+4': '4+4', other: 'Diğer',
  women_only: 'Sadece kız', men_only: 'Sadece erkek', none_stated: 'Belirtilmemiş', ambiguous: 'Belirsiz',
};
