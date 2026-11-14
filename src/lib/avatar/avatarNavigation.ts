export interface NavigationMatch {
  targetRoute: string;
  sectionName: string;
  activeIndex: number;
  confirmationSpeech: string;
}

/**
 * Foydalanuvchining ovozli gapidan bo'limga kirish niyatini aniqlaydi.
 * Masalan: "Til bo'limiga kir", "Kasblarni och", "Psixologiyaga o't", "Bosh sahifaga qayt" va h.k.
 */
export function detectNavigationIntent(
  userText: string,
  currentActiveIndex: number = 0
): NavigationMatch | null {
  if (!userText) return null;
  const lower = userText.toLowerCase().trim();

  // Harakat buyruqlari (kirish, ochish, o'tish va h.k.)
  const hasNavAction =
    lower.includes('kir') ||
    lower.includes('och') ||
    lower.includes("o't") ||
    lower.includes("o‘t") ||
    lower.includes("ot") ||
    lower.includes('boshla') ||
    lower.includes('bor') ||
    lower.includes('olib kir') ||
    lower.includes('olib bor') ||
    lower.includes('tanla') ||
    lower.includes('korsat') ||
    lower.includes("ko'rsat") ||
    lower.includes("ko‘rsat") ||
    lower.includes('yurgiz') ||
    lower.includes('yur') ||
    lower.includes('open') ||
    lower.includes('enter') ||
    lower.includes('go to') ||
    lower.includes('перейти') ||
    lower.includes('открой') ||
    lower.includes('войти') ||
    lower.includes('зайти');

  // Faqat savol berayotgan bo'lsa (lekin kirish buyrug'i bo'lmasa), navigatsiya qilmaymiz
  const isQuestionOnly =
    (lower.includes('qanday') ||
      lower.includes('nimalar') ||
      lower.includes('qanaqa') ||
      lower.includes('tushuntir') ||
      lower.includes('aytib ber') ||
      lower.includes('haqida') ||
      lower.includes('nima bor')) &&
    !hasNavAction;

  if (isQuestionOnly) return null;

  // 0. Sub-routes (Aniq ichki sahifalar)
  if (lower.includes('test') && (lower.includes('psixolog') || lower.includes('ruhiy'))) {
    return {
      targetRoute: '/psychology/test',
      sectionName: "Psixologik test",
      activeIndex: 3,
      confirmationSpeech: "Psixologik test bo'limiga kirmoqdamiz!",
    };
  }

  if (lower.includes('chat') && lower.includes('psixolog')) {
    return {
      targetRoute: '/psychology/chat',
      sectionName: "Psixologik chat",
      activeIndex: 3,
      confirmationSpeech: "Psixologik ko'mak chatiga kirmoqdamiz!",
    };
  }

  if (lower.includes('vosita') || lower.includes('tools') || lower.includes('katalog')) {
    return {
      targetRoute: '/ai/tools',
      sectionName: "Sun'iy intellekt vositalari",
      activeIndex: 4,
      confirmationSpeech: "Sun'iy intellekt vositalari katalogiga kirmoqdamiz!",
    };
  }

  if (lower.includes('chat') && (lower.includes('ai') || lower.includes("sun'iy") || lower.includes('bot'))) {
    return {
      targetRoute: '/ai/chat',
      sectionName: "AI Chat",
      activeIndex: 4,
      confirmationSpeech: "Sun'iy intellekt ochiq chatiga kirmoqdamiz!",
    };
  }

  // 1. Til o'rganish (/language)
  if (
    lower.includes('til') ||
    lower.includes('ingliz') ||
    lower.includes('rus') ||
    lower.includes('nemis') ||
    lower.includes('xitoy') ||
    lower.includes('ibrat') ||
    lower.includes("1-bo'lim") ||
    lower.includes("1-bo‘lim") ||
    lower.includes('birinchi bo') ||
    lower.includes("1-yo'nalish") ||
    lower.includes("1-yo‘nalish") ||
    lower.includes('birinchi yo')
  ) {
    return {
      targetRoute: '/language',
      sectionName: "Til o'rganish",
      activeIndex: 0,
      confirmationSpeech: "Xo'p bo'ladi, Til o'rganish bo'limiga kirmoqdamiz!",
    };
  }

  // 2. Zamonaviy kasb o'rganish (/career)
  if (
    lower.includes('kasb') ||
    lower.includes('dastur') ||
    lower.includes('it') ||
    lower.includes('kurs') ||
    lower.includes('ustoz') ||
    lower.includes('smm') ||
    lower.includes('grafik') ||
    lower.includes('dizayn') ||
    lower.includes("2-bo'lim") ||
    lower.includes("2-bo‘lim") ||
    lower.includes('ikkinchi bo') ||
    lower.includes("2-yo'nalish") ||
    lower.includes("2-yo‘nalish") ||
    lower.includes('ikkinchi yo')
  ) {
    return {
      targetRoute: '/career',
      sectionName: "Zamonaviy kasb o'rganish",
      activeIndex: 1,
      confirmationSpeech: "Xo'p bo'ladi, Zamonaviy kasb o'rganish bo'limiga kirmoqdamiz!",
    };
  }

  // 3. Xavfsiz migratsiya (/migration)
  if (
    lower.includes('migrats') ||
    lower.includes('viza') ||
    lower.includes('xorij') ||
    lower.includes('chet el') ||
    lower.includes('pasport') ||
    lower.includes("3-bo'lim") ||
    lower.includes("3-bo‘lim") ||
    lower.includes('uchinchi bo') ||
    lower.includes("3-yo'nalish") ||
    lower.includes("3-yo‘nalish") ||
    lower.includes('uchinchi yo')
  ) {
    return {
      targetRoute: '/migration',
      sectionName: "Xavfsiz migratsiya",
      activeIndex: 2,
      confirmationSpeech: "Xo'p bo'ladi, Xavfsiz migratsiya bo'limiga kirmoqdamiz!",
    };
  }

  // 4. Psixologik ko'mak (/psychology)
  if (
    lower.includes('psixolog') ||
    lower.includes('stress') ||
    lower.includes('ruhiy') ||
    lower.includes('kayfiyat') ||
    lower.includes('maslahat') ||
    lower.includes("4-bo'lim") ||
    lower.includes("4-bo‘lim") ||
    lower.includes("to'rtinchi bo") ||
    lower.includes("to‘rtinchi bo") ||
    lower.includes("4-yo'nalish") ||
    lower.includes("4-yo‘nalish") ||
    lower.includes("to'rtinchi yo")
  ) {
    return {
      targetRoute: '/psychology',
      sectionName: "Psixologik ko'mak",
      activeIndex: 3,
      confirmationSpeech: "Albatta, Psixologik ko'mak bo'limiga kirmoqdamiz!",
    };
  }

  // 5. Sun'iy intellekt Hubi (/ai)
  if (
    lower.includes('ai') ||
    lower.includes("sun'iy") ||
    lower.includes("sun‘iy") ||
    lower.includes('bot') ||
    lower.includes('intellekt') ||
    lower.includes('texnologiya') ||
    lower.includes("5-bo'lim") ||
    lower.includes("5-bo‘lim") ||
    lower.includes('beshinchi bo') ||
    lower.includes("5-yo'nalish") ||
    lower.includes("5-yo‘nalish") ||
    lower.includes('beshinchi yo')
  ) {
    return {
      targetRoute: '/ai',
      sectionName: "Sun'iy intellekt Hubi",
      activeIndex: 4,
      confirmationSpeech: "Xo'p bo'ladi, Sun'iy intellekt Hubiga kirmoqdamiz!",
    };
  }

  // 6. Tarixiy shaxslar va buyuk allomalar (/history)
  if (
    lower.includes('tarix') ||
    lower.includes('temur') ||
    lower.includes('navoiy') ||
    lower.includes('ulug') ||
    lower.includes('ulug‘') ||
    lower.includes("ulug'") ||
    lower.includes('jadid') ||
    lower.includes('shaxs') ||
    lower.includes('behbudiy') ||
    lower.includes('avloniy') ||
    lower.includes('bobur') ||
    lower.includes('alloma') ||
    lower.includes("6-bo'lim") ||
    lower.includes("6-bo‘lim") ||
    lower.includes('oltinchi bo') ||
    lower.includes("6-yo'nalish") ||
    lower.includes("6-yo‘nalish") ||
    lower.includes('oltinchi yo')
  ) {
    return {
      targetRoute: '/history',
      sectionName: "Buyuk allomalar",
      activeIndex: 5,
      confirmationSpeech: "Xo'p bo'ladi, Buyuk allomalar va tarixiy shaxslar bo'limiga kirmoqdamiz!",
    };
  }

  // 7. Bosh sahifa / Asosiy menyu / Orqaga
  if (
    lower.includes('bosh sahifa') ||
    lower.includes('dashboard') ||
    lower.includes('asosiy sahifa') ||
    lower.includes('bosh menyu') ||
    lower.includes('orqaga') ||
    lower.includes('uyga')
  ) {
    return {
      targetRoute: '/dashboard',
      sectionName: "Bosh sahifa",
      activeIndex: 0,
      confirmationSpeech: "Bosh sahifaga qaytmoqdamiz!",
    };
  }

  // 8. Profil
  if (lower.includes('profil') || lower.includes('kabinet') || lower.includes("ma'lumotim") || lower.includes("ma‘lumotim")) {
    return {
      targetRoute: '/profile',
      sectionName: "Foydalanuvchi profili",
      activeIndex: 0,
      confirmationSpeech: "Profilingiz sahifasiga o'tmoqdamiz!",
    };
  }

  // 9. Chiqish / Sessiyani yakunlash
  if (
    lower.includes('chiqish') ||
    lower.includes('sessiyani tugat') ||
    lower.includes('sessiyani yakunla') ||
    lower.includes('tamomlash') ||
    (lower === 'chiq' && hasNavAction)
  ) {
    return {
      targetRoute: '/session-end',
      sectionName: "Chiqish",
      activeIndex: 0,
      confirmationSpeech: "Sessiyangiz yakunlanmoqda. Salomat bo'ling!",
    };
  }

  // 10. Foydalanuvchi ekranda turgan kartaga "kir", "och", "shunga kir" desa
  if (hasNavAction) {
    const isGenericNav =
      lower === 'kir' ||
      lower === 'och' ||
      lower === 'kirish' ||
      lower === "o't" ||
      lower === "o‘t" ||
      lower === 'boshla' ||
      lower.includes('shu bo') ||
      lower.includes('bu bo') ||
      lower.includes('shunga kir') ||
      lower.includes('shuni och') ||
      lower.includes('kirib ber');

    if (isGenericNav) {
      const routes = ['/language', '/career', '/migration', '/psychology', '/ai', '/history'];
      const names = [
        "Til o'rganish",
        "Zamonaviy kasb o'rganish",
        "Xavfsiz migratsiya",
        "Psixologik ko'mak",
        "Sun'iy intellekt",
        "Buyuk allomalar",
      ];
      const idx = currentActiveIndex >= 0 && currentActiveIndex < routes.length ? currentActiveIndex : 0;
      return {
        targetRoute: routes[idx],
        sectionName: names[idx],
        activeIndex: idx,
        confirmationSpeech: `Xo'p bo'ladi, ${names[idx]} bo'limiga kirmoqdamiz!`,
      };
    }
  }

  return null;
}
