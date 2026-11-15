// Subtitle text, one array of cues per scene of each cut (same order as scenes.mjs).
// English = the on-screen headline and body text of the scene (kickers, source labels and small
// print are left out; see README "Subtitles"). Arabic = Modern Standard Arabic; game terms follow
// data/strings/ar*.json and client/src/i18n/strings/ar.*.json (role card = بطاقة الدور,
// control console = وحدة التحكم, call sign = الاسم الرمزي, Build Bay = ورشة البناء, ...).
// MissionForge, NASA, Unity, role names (FLIGHT, BOOSTER ...), GO / NO-GO, Max Q, Isp, Δv and
// SI units / $ M stay in Latin script, as in the game's own Arabic strings. "\n" forces a line break.
const T = '“';
const U = '”';

export const CUES = {
  '2min': {
    en: [
      ['MissionForge', 'A party game where your team designs a space mission, then flies it.'],
      ['Design a space mission.\nEvery choice costs something.', 'Mass, power, budget, instruments, orbit, communications',
        'Contract C1 Earth Watch: a 150 kg imaging satellite', 'to a 550 km Sun-synchronous orbit (97.6°), on 90 M game-dollars, in 180 days.'],
      ['One big screen hosts the mission', 'The Unity host runs on a laptop or TV; phones are the controllers.'],
      ['Join with a 4-letter room code or the QR code', 'No app, no account, no chat. 1 to 10 players, plus an audience.'],
      ['Type a call sign and you are in the crew', 'The phone is the controller: role console, part cards, votes and minigames.'],
      ['Each phone becomes a mission-control console', '10 roles, from FLIGHT and BOOSTER to EECOM, INCO and PAYLOAD.', 'With fewer players, roles merge automatically.'],
      ['22 part votes build the rocket and the satellite', 'The dashboard shows delta-v, thrust-to-weight, cost,', 'schedule, power and data before the team commits.'],
      ['Every option shows its numbers and its drawbacks', 'Thrust, Isp, mass, cost and a real-world twin.', 'A card warns when an option is over budget.', 'There is no perfect build'],
      [`${T}If chosen${U} shows what each option changes`, 'Small fairing: +$2.0 M. Standard fairing: +$5.0 M and a structures concern.', '(Costs are game-dollars.)'],
      ['The crew votes, and the build updates', 'Live tallies, then the phone’s readiness dashboard after each decision:', 'delta-v, thrust-to-weight, budget, success chance.'],
      ['Compare two options side by side', 'Also: exploded view, scale reference and stability markers.'],
      ['The vehicle is assembled live in 3D'],
      ['Every console calls GO or NO-GO', 'As in a real readiness review, a NO-GO stops the count for a discussion.'],
      ['Consoles call out problems in flight', 'Max Q is coming: STRUCT calls the throttle-down for a Good Call.'],
      ['Max Q Throttle Bucket', 'Keep dynamic pressure inside the band to protect the structure.', '32 minigames on the phone'],
      ['Solar Wing Deploy', 'Turn the wings to the Sun to stay power-positive.'],
      ['Ground Station Pass', 'Steer the antenna, lock on and downlink the data.'],
      ['Science Capture', 'Point the instrument you chose. Clouds block optical shots.'],
      ['The debrief explains the result', 'Score breakdown, awards, and the facts met along the way, each with its source.'],
      ['Six languages. Large text. High contrast.', 'English, Arabic (right to left), Spanish, French, Portuguese, Hindi.', '200% text, reduced motion, relaxed and one-button minigames.', 'Left: Arabic. Right: 200% text, high contrast.'],
      ['MissionForge\nDesign it. Launch it. Learn why it worked.', 'Team Winton · NASA Space Apps Challenge 2026', 'Built with AI coding agents. Key art and briefing film are AI-generated.', 'Not affiliated with or endorsed by NASA.'],
    ],
    ar: [
      ['MissionForge', 'لعبة جماعية يصمم فيها فريقك مهمة فضائية، ثم يطير بها.'],
      ['صمّم مهمة فضائية.\nكل خيار له ثمن.', 'الكتلة والطاقة والميزانية والأدوات والمدار والاتصالات',
        'العقد C1 مراقبة الأرض: قمر اصطناعي للتصوير بكتلة 150 kg في مدار متزامن مع الشمس', 'على ارتفاع 550 km وبميل 97.6°، بميزانية 90 M دولار لعبة، خلال 180 يومًا.'],
      ['شاشة كبيرة واحدة تستضيف المهمة', 'يعمل مضيف Unity على حاسوب محمول أو تلفاز؛ والهواتف هي أجهزة التحكم.'],
      ['انضم برمز غرفة من 4 أحرف أو برمز QR', 'بلا تطبيق ولا حساب ولا دردشة. من 1 إلى 10 لاعبين، مع جمهور.'],
      ['اكتب اسمًا رمزيًا لتصبح في الطاقم', 'الهاتف هو جهاز التحكم: وحدة الدور وبطاقات القطع والتصويت والألعاب المصغرة.'],
      ['كل هاتف يصبح وحدة تحكم في مركز التحكم بالمهمة', '10 أدوار، من FLIGHT وBOOSTER إلى EECOM وINCO وPAYLOAD.', 'ومع عدد أقل من اللاعبين، تندمج الأدوار تلقائيًا.'],
      ['22 تصويتًا على القطع تبني الصاروخ والقمر الاصطناعي', 'تعرض اللوحة Δv ونسبة الدفع إلى الوزن والتكلفة', 'والجدول الزمني والطاقة والبيانات قبل أن يلتزم الفريق.'],
      ['كل خيار يعرض أرقامه وعيوبه', 'الدفع وIsp والكتلة والتكلفة والنظير في الواقع.', 'وتحذّر البطاقة عندما يتجاوز الخيار الميزانية.', 'لا يوجد بناء مثالي'],
      ['«إن تم اختياره» يعرض ما يغيّره كل خيار', 'غطاء صغير: +$2.0 M. غطاء قياسي: +$5.0 M ومشكلة تخص الهياكل.', '(التكاليف بدولارات اللعبة.)'],
      ['يصوّت الطاقم ويتحدّث البناء', 'تظهر النتائج الحية، ثم لوحة الجاهزية في الهاتف بعد كل قرار:', 'Δv ونسبة الدفع إلى الوزن والميزانية واحتمال النجاح.'],
      ['قارن بين خيارين جنبًا إلى جنب', 'وأيضًا: العرض المفكَّك ومرجع المقياس وعلامات الاستقرار.'],
      ['تُجمَّع المركبة مباشرةً في 3D'],
      ['كل وحدة تحكم تعلن GO أو NO-GO', 'كما في مراجعة جاهزية حقيقية، توقف NO-GO العد لإجراء نقاش.'],
      ['وحدات التحكم تنبّه إلى المشكلات أثناء الطيران', 'نقترب من Max Q: يعلن STRUCT خفض الدفع فيحقق قرارًا موفقًا.'],
      ['خفض الدفع عند Max Q', 'أبقِ الضغط الديناميكي داخل النطاق لحماية الهيكل.', '32 لعبة مصغرة على الهاتف'],
      ['نشر الأجنحة الشمسية', 'أدر الأجنحة نحو الشمس لتبقى الطاقة موجبة.'],
      ['المرور فوق المحطة الأرضية', 'وجّه الهوائي وثبّت الإشارة وأرسل البيانات إلى الأرض.'],
      ['التقاط البيانات العلمية', 'صوّب الأداة التي اخترتها. الغيوم تحجب اللقطات البصرية.'],
      ['تقرير ما بعد المهمة يشرح النتيجة', 'تفصيل النتيجة والجوائز والحقائق التي صادفتها، ولكل حقيقة مصدرها.'],
      ['ست لغات. نص كبير. تباين عالٍ.', 'الإنجليزية والعربية (من اليمين إلى اليسار) والإسبانية والفرنسية والبرتغالية والهندية.', 'نص بنسبة 200% وحركة مخفضة وألعاب مصغرة مريحة أو بزر واحد.', 'يسار: العربية. يمين: نص 200% وتباين عالٍ.'],
      ['MissionForge\nصمّمها. أطلقها. وتعلّم لماذا نجحت.', 'Team Winton · NASA Space Apps Challenge 2026', 'بُنيت بوكلاء برمجة ذكية؛ الصورة الفنية وفيلم الإحاطة مولّدان بالذكاء الاصطناعي.', 'هذا المشروع غير تابع لـ NASA ولا تدعمه.'],
    ],
  },
  '30s': {
    en: [
      ['MissionForge\nEvery space mission is a set of trade-offs.'],
      ['Scan a code. Your phone becomes mission control.', 'No app, no account. 1 to 10 players.'],
      ['Vote on every part', 'Each choice changes mass, power, cost, schedule and risk.'],
      ['No perfect build', 'Every option shows its numbers and its drawbacks.'],
      ['Then fly it together:\nMax Q Throttle Bucket', 'Mass and structure'],
      ['Solar Wing Deploy\nPower'],
      ['Science Capture\nInstruments'],
      ['MissionForge\nDesign it. Launch it. Learn why it worked.', 'Team Winton · NASA Space Apps Challenge 2026', 'AI-generated key art. Not affiliated with or endorsed by NASA.'],
    ],
    ar: [
      ['MissionForge\nكل مهمة فضائية هي سلسلة مفاضلات.'],
      ['امسح الرمز ليصبح هاتفك مركز التحكم بالمهمة.', 'بلا تطبيق ولا حساب. من 1 إلى 10 لاعبين.'],
      ['صوّت على كل قطعة', 'كل خيار يغيّر الكتلة والطاقة والتكلفة والجدول الزمني والمخاطر.'],
      ['لا يوجد بناء مثالي', 'كل خيار يعرض أرقامه وعيوبه.'],
      ['ثم طيروا معًا:\nخفض الدفع عند Max Q', 'الكتلة والهيكل'],
      ['نشر الأجنحة الشمسية\nالطاقة'],
      ['التقاط البيانات العلمية\nالأدوات'],
      ['MissionForge\nصمّمها. أطلقها. وتعلّم لماذا نجحت.', 'Team Winton · NASA Space Apps Challenge 2026', 'صورة فنية مولّدة بالذكاء الاصطناعي. غير تابع لـ NASA ولا تدعمه.'],
    ],
  },
};
