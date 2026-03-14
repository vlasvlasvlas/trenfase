/**
 * TRENFASE — Station Data
 * 30 stations of the JR Yamanote Line (inner/counter-clockwise loop)
 * Starting from Tokyo Station (JY-01)
 */

const STATIONS = [
  { id: 'tokyo',             nameEn: 'Tokyo',             nameJp: '東京',           code: 'JY-01', audioFile: 'audio/sh3.mp3' },
  { id: 'kanda',             nameEn: 'Kanda',             nameJp: '神田',           code: 'JY-02', audioFile: 'audio/seseragi.mp3' },
  { id: 'akihabara',         nameEn: 'Akihabara',         nameJp: '秋葉原',         code: 'JY-03', audioFile: 'audio/ogawav1.mp3' },
  { id: 'okachimachi',       nameEn: 'Okachimachi',       nameJp: '御徒町',         code: 'JY-04', audioFile: 'audio/harutrem.mp3' },
  { id: 'ueno',              nameEn: 'Ueno',              nameJp: '上野',           code: 'JY-05', audioFile: 'audio/bellb.mp3' },
  { id: 'uguisudani',        nameEn: 'Uguisudani',        nameJp: '鶯谷',           code: 'JY-06', audioFile: 'audio/harunew.mp3' },
  { id: 'nippori',           nameEn: 'Nippori',           nameJp: '日暮里',         code: 'JY-07', audioFile: 'audio/sf1.mp3' },
  { id: 'nishinippori',      nameEn: 'Nishi-Nippori',     nameJp: '西日暮里',       code: 'JY-08', audioFile: 'audio/springbox.mp3' },
  { id: 'tabata',            nameEn: 'Tabata',            nameJp: '田端',           code: 'JY-09', audioFile: 'audio/sf3.mp3' },
  { id: 'komagome',          nameEn: 'Komagome',          nameJp: '駒込',           code: 'JY-10', audioFile: 'audio/sakurab.mp3' },
  { id: 'sugamo',            nameEn: 'Sugamo',            nameJp: '巣鴨',           code: 'JY-11', audioFile: 'audio/haru.mp3' },
  { id: 'otsuka',            nameEn: 'Ōtsuka',            nameJp: '大塚',           code: 'JY-12', audioFile: 'audio/beautifulhill.mp3' },
  { id: 'ikebukuro',         nameEn: 'Ikebukuro',         nameJp: '池袋',           code: 'JY-13', audioFile: 'audio/melody.mp3' },
  { id: 'mejiro',            nameEn: 'Mejiro',            nameJp: '目白',           code: 'JY-14', audioFile: 'audio/mellowtime.mp3' },
  { id: 'takadanobaba',      nameEn: 'Takadanobaba',      nameJp: '高田馬場',       code: 'JY-15', audioFile: 'audio/astrob.mp3' },
  { id: 'shinokubo',         nameEn: 'Shin-Ōkubo',        nameJp: '新大久保',       code: 'JY-16', audioFile: 'audio/bellb.mp3' },
  { id: 'shinjuku',          nameEn: 'Shinjuku',          nameJp: '新宿',           code: 'JY-17', audioFile: 'audio/aratana.mp3' },
  { id: 'yoyogi',            nameEn: 'Yoyogi',            nameJp: '代々木',         code: 'JY-18', audioFile: 'audio/sh5.mp3' },
  { id: 'harajuku',          nameEn: 'Harajuku',          nameJp: '原宿',           code: 'JY-19', audioFile: 'audio/harajukua.mp3' },
  { id: 'shibuya',           nameEn: 'Shibuya',           nameJp: '渋谷',           code: 'JY-20', audioFile: 'audio/hananohorokobi.mp3' },
  { id: 'ebisu',             nameEn: 'Ebisu',             nameJp: '恵比寿',         code: 'JY-21', audioFile: 'audio/thirdman.mp3' },
  { id: 'meguro',            nameEn: 'Meguro',            nameJp: '目黒',           code: 'JY-22', audioFile: 'audio/watercrown.mp3' },
  { id: 'gotanda',           nameEn: 'Gotanda',           nameJp: '五反田',         code: 'JY-23', audioFile: 'audio/sh23.mp3' },
  { id: 'osaki',             nameEn: 'Ōsaki',             nameJp: '大崎',           code: 'JY-24', audioFile: 'audio/uminoeki.mp3' },
  { id: 'shinagawa',         nameEn: 'Shinagawa',         nameJp: '品川',           code: 'JY-25', audioFile: 'audio/fightingspirita.mp3' },
  { id: 'takanawagateway',   nameEn: 'Takanawa GW',       nameJp: '高輪ゲートウェイ', code: 'JY-26', audioFile: 'audio/sweetcall.mp3' },
  { id: 'tamachi',           nameEn: 'Tamachi',           nameJp: '田町',           code: 'JY-27', audioFile: 'audio/sunlight.mp3' },
  { id: 'hamamatsucho',      nameEn: 'Hamamatsuchō',      nameJp: '浜松町',         code: 'JY-28', audioFile: 'audio/beyondtheline.mp3' },
  { id: 'shimbashi',         nameEn: 'Shimbashi',         nameJp: '新橋',           code: 'JY-29', audioFile: 'audio/gotadelvient.mp3' },
  { id: 'yurakucho',         nameEn: 'Yūrakuchō',         nameJp: '有楽町',         code: 'JY-30', audioFile: 'audio/sh21.mp3' },
];

// Add computed properties to each station
STATIONS.forEach((station, index) => {
  station.index = index;
  // Parametric position (0-1) along the path
  station.t = index / STATIONS.length;
  // Keep angle for color-bg backward compat
  station.angle = station.t * 360;
  station.active = true;
  station.ghost = false;
  station.trimStart = 0;
  station.trimEnd = null; // null = full duration
  station.volume = 1.0;
  station.pitch = 1.0;
  // Per-station FX defaults
  station.fx = {
    delayTime: 0,       // 0-2 seconds
    delayFeedback: 0,   // 0-0.9
    delayWet: 0,        // 0-1
    filterType: 'lowpass',
    filterFreq: 20000,  // 20-20000 Hz (20000 = no filtering)
    filterQ: 1,         // 0.1-15
  };
  // Distribute colors across hue spectrum
  station.color = {
    h: Math.round((index / STATIONS.length) * 360),
    s: 70,
    l: 55
  };
});

export { STATIONS };
