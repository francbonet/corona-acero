import { Faction } from '../data/factions';

/**
 * Lo que dicen las unidades, en el idioma de cada corona: castellano (Castilla), catalán (Corona de Aragón),
 * inglés (Inglaterra y Escocia), francés (Francia), portugués (Portugal) y árabe (Reino Nazarí). Frases
 * cortas de época al seleccionar, al dar una orden, al mandar atacar y al salir de un edificio; los soldados y
 * los jinetes de cada corona gritan además su grito de guerra.
 */

export type VoiceKind = 'villager' | 'woman' | 'soldier' | 'rider' | 'monk' | 'siege';
export type VoiceMoment = 'select' | 'order' | 'attack' | 'trained';
export type VoiceLang = 'es' | 'ca' | 'en' | 'fr' | 'pt' | 'ar';

type Lines = Readonly<Record<VoiceKind, Readonly<Record<VoiceMoment, readonly string[]>>>>;

export const LANG_NAMES: Readonly<Record<VoiceLang, string>> = {
  es: 'castellano',
  ca: 'catalán',
  en: 'inglés',
  fr: 'francés',
  pt: 'portugués',
  ar: 'árabe',
};

export const VOICE_LINES: Readonly<Record<VoiceLang, Lines>> = {
  es: {
    villager: {
      select: ['¿Sí, mi señor?', '¿Qué mandáis?', 'Decidme.', 'A vuestro servicio.', '¿Mi señor?'],
      order: ['Ahora mismo.', 'Allá voy.', 'Como mandéis.', 'Enseguida.', 'Sí, señor.'],
      attack: ['¡Fuera de aquí!', '¡Tomad esto!', 'Si no hay más remedio…'],
      trained: ['Listo para trabajar.', 'Aquí me tenéis.'],
    },
    woman: {
      select: ['¿Sí, mi señor?', '¿Qué deseáis?', 'Aquí estoy.', 'Decidme, señor.'],
      order: ['Ahora voy.', 'Como digáis.', 'Enseguida, señor.', 'Bien está.'],
      attack: ['¡Largo de aquí!', '¡Ya veréis!'],
      trained: ['Lista para trabajar.', 'Aquí me tenéis, señor.'],
    },
    soldier: {
      select: ['¡A la orden!', '¿Señor?', 'Listo para luchar.', 'Mandad, señor.'],
      order: ['¡Adelante!', '¡En marcha!', '¡Sí, señor!', 'Entendido.'],
      attack: ['¡A por ellos!', '¡Por la corona!', '¡Al ataque!', '¡Sin cuartel!'],
      trained: ['¡Listo para la batalla!', '¡A vuestras órdenes!'],
    },
    rider: {
      select: ['¿Mi señor?', 'Montura lista.', '¿Adónde cabalgo?'],
      order: ['¡Al galope!', '¡Allá voy!', '¡Sí, señor!'],
      attack: ['¡A la carga!', '¡Por la corona!', '¡Arrolladlos!'],
      trained: ['¡Jinete listo!', '¡A caballo, señor!'],
    },
    monk: {
      select: ['La paz sea con vos.', '¿Hijo mío?', 'Dios os guarde.'],
      order: ['Así sea.', 'Voy con Dios.', 'Hágase vuestra voluntad.'],
      attack: ['Que Dios los perdone.', 'Abrid los ojos a la fe.'],
      trained: ['Para servir a Dios y a vos.'],
    },
    siege: {
      select: ['Máquina lista.', '¿Señor?', 'Esperamos órdenes.'],
      order: ['¡Empujad!', 'En marcha.', 'Despacio, que pesa.'],
      attack: ['¡Abajo esos muros!', '¡Fuego!', '¡Que no quede piedra!'],
      trained: ['Máquina terminada, señor.'],
    },
  },
  ca: {
    villager: {
      select: ['Sí, senyor meu?', 'Què maneu?', 'Digueu.', 'Al vostre servei.', 'Senyor?'],
      order: ['Ara mateix.', 'Ja hi vaig.', 'Com maneu.', 'De seguida.', 'Sí, senyor.'],
      attack: ["Fora d'aquí!", 'Preneu això!', 'Si no hi ha més remei…'],
      trained: ['A punt per treballar.', 'Aquí em teniu.'],
    },
    woman: {
      select: ['Sí, senyor meu?', 'Què desitgeu?', 'Aquí sóc.', 'Digueu, senyor.'],
      order: ['Ja hi vaig.', 'Com digueu.', 'De seguida, senyor.', 'Molt bé.'],
      attack: ["Fora d'aquí!", 'Ja veureu!'],
      trained: ['A punt per treballar.', 'Aquí em teniu, senyor.'],
    },
    soldier: {
      select: ['A les vostres ordres!', 'Senyor?', 'A punt per lluitar.', 'Maneu, senyor.'],
      order: ['Endavant!', 'En marxa!', 'Sí, senyor!', 'Entesos.'],
      attack: ['A per ells!', 'Per la corona!', "A l'atac!", 'Sense quarter!'],
      trained: ['A punt per a la batalla!', 'Al vostre servei, senyor!'],
    },
    rider: {
      select: ['Senyor meu?', 'Cavall a punt.', 'Cap on cavalco?'],
      order: ['Al galop!', 'Ja hi vaig!', 'Sí, senyor!'],
      attack: ['A la càrrega!', 'Per la corona!', 'Aixafeu-los!'],
      trained: ['Genet a punt!', 'A cavall, senyor!'],
    },
    monk: {
      select: ['La pau sigui amb vós.', 'Fill meu?', 'Déu us guard.'],
      order: ['Així sigui.', 'Vaig amb Déu.', "Faci's la vostra voluntat."],
      attack: ['Que Déu els perdoni.', 'Obriu els ulls a la fe.'],
      trained: ['Per servir Déu i a vós.'],
    },
    siege: {
      select: ['Màquina a punt.', 'Senyor?', 'Esperem ordres.'],
      order: ['Empenyeu!', 'En marxa.', 'A poc a poc, que pesa.'],
      attack: ['A terra aquests murs!', 'Foc!', 'Que no hi quedi pedra!'],
      trained: ['Màquina acabada, senyor.'],
    },
  },
  en: {
    villager: {
      select: ['Yes, my lord?', 'What is your bidding?', 'Speak, sire.', 'At your service.', 'My lord?'],
      order: ['Right away.', 'On my way.', 'As you command.', 'At once.', 'Aye, sire.'],
      attack: ['Away with you!', 'Take that!', 'If I must…'],
      trained: ['Ready to work.', 'Here I am, my lord.'],
    },
    woman: {
      select: ['Yes, my lord?', 'What do you wish?', 'Here I am.', 'Speak, sire.'],
      order: ['On my way.', 'As you say.', 'At once, sire.', 'Very well.'],
      attack: ['Begone!', 'You will see!'],
      trained: ['Ready to work.', 'Here I am, sire.'],
    },
    soldier: {
      select: ['At your command!', 'Sire?', 'Ready to fight.', 'Command me, sire.'],
      order: ['Forward!', 'On the march!', 'Aye, sire!', 'Understood.'],
      attack: ['At them!', 'For the crown!', 'Attack!', 'No quarter!'],
      trained: ['Ready for battle!', 'At your orders!'],
    },
    rider: {
      select: ['My lord?', 'My horse is ready.', 'Where shall I ride?'],
      order: ['At the gallop!', 'Riding now!', 'Aye, sire!'],
      attack: ['Charge!', 'For the crown!', 'Ride them down!'],
      trained: ['Rider ready!', 'To horse, sire!'],
    },
    monk: {
      select: ['Peace be with you.', 'My son?', 'God keep you.'],
      order: ['So be it.', 'I go with God.', 'Thy will be done.'],
      attack: ['May God forgive them.', 'Open your eyes to the faith.'],
      trained: ['To serve God and you.'],
    },
    siege: {
      select: ['Engine ready.', 'Sire?', 'Awaiting orders.'],
      order: ['Push!', 'Moving out.', 'Slowly, it is heavy.'],
      attack: ['Bring down those walls!', 'Loose!', 'Leave no stone standing!'],
      trained: ['The engine is finished, sire.'],
    },
  },
  fr: {
    villager: {
      select: ['Oui, mon seigneur ?', 'Que voulez-vous ?', 'Je vous écoute.', 'À votre service.', 'Mon seigneur ?'],
      order: ['Tout de suite.', "J'y vais.", 'À vos ordres.', 'Sur-le-champ.', 'Oui, seigneur.'],
      attack: ["Hors d'ici !", 'Prends ça !', "S'il le faut…"],
      trained: ['Prêt à travailler.', 'Me voici.'],
    },
    woman: {
      select: ['Oui, mon seigneur ?', 'Que désirez-vous ?', 'Me voici.', 'Je vous écoute, seigneur.'],
      order: ["J'y vais.", 'Comme vous voudrez.', 'Tout de suite, seigneur.', 'Bien.'],
      attack: ['Allez-vous-en !', 'Vous allez voir !'],
      trained: ['Prête à travailler.', 'Me voici, seigneur.'],
    },
    soldier: {
      select: ['À vos ordres !', 'Seigneur ?', 'Prêt au combat.', 'Ordonnez, seigneur.'],
      order: ['En avant !', 'En marche !', 'Oui, seigneur !', 'Compris.'],
      attack: ['Sus à eux !', 'Pour la couronne !', "À l'attaque !", 'Sans quartier !'],
      trained: ['Prêt pour la bataille !', 'À votre service !'],
    },
    rider: {
      select: ['Mon seigneur ?', 'Monture prête.', 'Où dois-je chevaucher ?'],
      order: ['Au galop !', "J'y vais !", 'Oui, seigneur !'],
      attack: ['Chargez !', 'Pour la couronne !', 'Écrasez-les !'],
      trained: ['Cavalier prêt !', 'À cheval, seigneur !'],
    },
    monk: {
      select: ['La paix soit avec vous.', 'Mon fils ?', 'Dieu vous garde.'],
      order: ['Ainsi soit-il.', 'Je vais avec Dieu.', 'Que votre volonté soit faite.'],
      attack: ['Que Dieu leur pardonne.', 'Ouvrez les yeux à la foi.'],
      trained: ['Pour servir Dieu et vous.'],
    },
    siege: {
      select: ['Machine prête.', 'Seigneur ?', 'Nous attendons vos ordres.'],
      order: ['Poussez !', 'En route.', "Doucement, c'est lourd."],
      attack: ['À bas ces murailles !', 'Tirez !', "Qu'il ne reste pierre sur pierre !"],
      trained: ['La machine est prête, seigneur.'],
    },
  },
  pt: {
    villager: {
      select: ['Sim, meu senhor?', 'Que mandais?', 'Dizei.', 'Ao vosso serviço.', 'Meu senhor?'],
      order: ['Já vou.', 'Lá vou eu.', 'Como mandardes.', 'Num instante.', 'Sim, senhor.'],
      attack: ['Fora daqui!', 'Tomai lá!', 'Se não há remédio…'],
      trained: ['Pronto para trabalhar.', 'Aqui me tendes.'],
    },
    woman: {
      select: ['Sim, meu senhor?', 'Que desejais?', 'Aqui estou.', 'Dizei, senhor.'],
      order: ['Já vou.', 'Como disserdes.', 'Num instante, senhor.', 'Está bem.'],
      attack: ['Fora daqui!', 'Vereis!'],
      trained: ['Pronta para trabalhar.', 'Aqui me tendes, senhor.'],
    },
    soldier: {
      select: ['Às ordens!', 'Senhor?', 'Pronto para lutar.', 'Mandai, senhor.'],
      order: ['Avante!', 'Em marcha!', 'Sim, senhor!', 'Entendido.'],
      attack: ['A eles!', 'Pela coroa!', 'Ao ataque!', 'Sem quartel!'],
      trained: ['Pronto para a batalha!', 'Às vossas ordens!'],
    },
    rider: {
      select: ['Meu senhor?', 'Montada pronta.', 'Para onde cavalgo?'],
      order: ['A galope!', 'Lá vou eu!', 'Sim, senhor!'],
      attack: ['Carregar!', 'Pela coroa!', 'Esmagai-os!'],
      trained: ['Cavaleiro pronto!', 'A cavalo, senhor!'],
    },
    monk: {
      select: ['A paz seja convosco.', 'Meu filho?', 'Deus vos guarde.'],
      order: ['Assim seja.', 'Vou com Deus.', 'Faça-se a vossa vontade.'],
      attack: ['Que Deus lhes perdoe.', 'Abri os olhos à fé.'],
      trained: ['Para servir a Deus e a vós.'],
    },
    siege: {
      select: ['Máquina pronta.', 'Senhor?', 'Aguardamos ordens.'],
      order: ['Empurrai!', 'Em marcha.', 'Devagar, que pesa.'],
      attack: ['Abaixo essas muralhas!', 'Fogo!', 'Que não fique pedra sobre pedra!'],
      trained: ['Máquina terminada, senhor.'],
    },
  },
  ar: {
    villager: {
      select: ['نعم يا سيدي؟', 'ما أمرك؟', 'تفضل يا مولاي.', 'في خدمتك.', 'مولاي؟'],
      order: ['حالاً.', 'أنا ذاهب.', 'كما تأمر.', 'في الحال.', 'سمعاً وطاعة.'],
      attack: ['ابتعدوا من هنا!', 'خذ هذه!', 'لا مفر من القتال…'],
      trained: ['جاهز للعمل.', 'ها أنا ذا.'],
    },
    woman: {
      select: ['نعم يا سيدي؟', 'ماذا تريد يا مولاي؟', 'ها أنا ذي.', 'تفضل يا سيدي.'],
      order: ['حاضرة.', 'كما تشاء.', 'في الحال يا سيدي.', 'حسناً.'],
      attack: ['اغربوا عن وجهي!', 'سترون!'],
      trained: ['جاهزة للعمل.', 'في خدمتك يا سيدي.'],
    },
    soldier: {
      select: ['أمرك يا سيدي!', 'سيدي؟', 'جاهز للقتال.', 'مُرني يا سيدي.'],
      order: ['إلى الأمام!', 'هيا بنا!', 'نعم يا سيدي!', 'مفهوم.'],
      attack: ['عليهم!', 'من أجل السلطان!', 'هجوم!', 'بلا رحمة!'],
      trained: ['جاهز للمعركة!', 'رهن إشارتك!'],
    },
    rider: {
      select: ['مولاي؟', 'الفرس جاهزة.', 'إلى أين أمضي؟'],
      order: ['بأقصى سرعة!', 'في الطريق!', 'نعم يا سيدي!'],
      attack: ['احملوا عليهم!', 'من أجل السلطان!', 'اسحقوهم!'],
      trained: ['الفارس جاهز!', 'على صهوة الجواد يا سيدي!'],
    },
    monk: {
      select: ['السلام عليكم.', 'يا بني؟', 'حفظك الله.'],
      order: ['إن شاء الله.', 'على بركة الله.', 'لتكن مشيئتك.'],
      attack: ['هداهم الله.', 'افتحوا قلوبكم للإيمان.'],
      trained: ['لخدمة الله وخدمتك.'],
    },
    siege: {
      select: ['الآلة جاهزة.', 'سيدي؟', 'ننتظر الأوامر.'],
      order: ['ادفعوا!', 'إلى الأمام.', 'ببطء، إنها ثقيلة.'],
      attack: ['اهدموا الأسوار!', 'أطلقوا!', 'لا تتركوا حجراً على حجر!'],
      trained: ['اكتملت الآلة يا سيدي.'],
    },
  },
};

export interface FactionVoice {
  readonly lang: VoiceLang;
  /** Variantes del idioma por orden de preferencia (las voces de España, de Inglaterra, de Francia…). */
  readonly locales: readonly string[];
  /** Voces preferidas por su nombre, antes que las de siempre (la escocesa para las aldeanas de Escocia). */
  readonly prefer?: Partial<Record<VoiceKind, readonly string[]>>;
  /** Gritos de guerra de los soldados y jinetes, además de los del idioma. */
  readonly cries: readonly string[];
}

export const FACTION_VOICES: Readonly<Record<Faction, FactionVoice>> = {
  [Faction.Castilla]: { lang: 'es', locales: ['es-es'], cries: ['¡Santiago y cierra, España!', '¡Castilla, Castilla!'] },
  [Faction.Inglaterra]: {
    lang: 'en',
    locales: ['en-gb', 'en-ie', 'en-au', 'en-us'],
    prefer: { woman: ['kate', 'serena', 'hazel', 'susan'] },
    cries: ['For Saint George!', 'God for England!'],
  },
  [Faction.Aragon]: { lang: 'ca', locales: ['ca-es'], cries: ['Desperta ferro!', 'Aragó, Aragó!', 'Via fora!'] },
  [Faction.Francia]: { lang: 'fr', locales: ['fr-fr', 'fr-be', 'fr-ch', 'fr-ca'], cries: ['Montjoie ! Saint-Denis !'] },
  [Faction.Nazari]: { lang: 'ar', locales: ['ar-sa', 'ar-001', 'ar-ma', 'ar-eg'], cries: ['لا غالب إلا الله!'] },
  [Faction.Portugal]: { lang: 'pt', locales: ['pt-pt', 'pt-br'], cries: ['Portugal e São Jorge!'] },
  [Faction.Escocia]: {
    lang: 'en',
    locales: ['en-gb', 'en-ie', 'en-au', 'en-us'],
    prefer: { woman: ['fiona', 'moira'] },
    cries: ['For Scotland!', 'Saint Andrew!'],
  },
};

/** Frases de una corona en un idioma: las del idioma y, en los ataques de soldados y jinetes, sus gritos de guerra. */
export function linesFor(faction: Faction, lang: VoiceLang, kind: VoiceKind, moment: VoiceMoment): readonly string[] {
  const base = VOICE_LINES[lang][kind][moment];
  const fv = FACTION_VOICES[faction];
  if (moment === 'attack' && (kind === 'soldier' || kind === 'rider') && fv.lang === lang) return [...base, ...fv.cries];
  return base;
}
