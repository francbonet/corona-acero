import { Faction } from '../data/factions';

/** Señores rivales: figuras históricas de cada corona (siglos XIII–XV). */
export interface Lord {
  readonly name: string;
  readonly title: string;
}

export const LORDS: Readonly<Record<Faction, readonly Lord[]>> = {
  [Faction.Castilla]: [
    { name: 'Alfonso X', title: 'el Sabio' },
    { name: 'Berenguela', title: 'la Grande' },
    { name: 'Fernando III', title: 'el Santo' },
    { name: 'María de Molina', title: 'la Prudente' },
    { name: 'Isabel I', title: 'la Católica' },
  ],
  [Faction.Inglaterra]: [
    { name: 'Eduardo I', title: 'Zanquilargo' },
    { name: 'Eduardo III', title: 'de Windsor' },
    { name: 'Enrique V', title: 'de Monmouth' },
    { name: 'Leonor', title: 'de Aquitania' },
    { name: 'Margarita', title: 'de Anjou' },
  ],
  [Faction.Aragon]: [
    { name: 'Jaume I', title: 'el Conqueridor' },
    { name: 'Pere III', title: 'el Gran' },
    { name: 'Pere IV', title: 'el Cerimoniós' },
    { name: 'Alfons V', title: 'el Magnànim' },
    { name: 'Elisenda', title: 'de Montcada' },
  ],
  [Faction.Francia]: [
    { name: 'Luis IX', title: 'el Santo' },
    { name: 'Felipe IV', title: 'el Hermoso' },
    { name: 'Carlos V', title: 'el Sabio' },
    { name: 'Carlos VII', title: 'el Victorioso' },
    { name: 'Blanca', title: 'de Castilla' },
  ],
  [Faction.Nazari]: [
    { name: 'Muhammad I', title: 'al-Ahmar' },
    { name: 'Yusuf I', title: 'de Granada' },
    { name: 'Muhammad V', title: 'al-Ganí' },
    { name: 'Abu l-Hasan', title: 'Muley Hacén' },
    { name: 'Aixa', title: 'la Horra' },
  ],
  [Faction.Portugal]: [
    { name: 'Dionisio I', title: 'el Labrador' },
    { name: 'Alfonso IV', title: 'el Bravo' },
    { name: 'Juan I', title: 'de Avís' },
    { name: 'Juan II', title: 'el Príncipe Perfecto' },
    { name: 'Felipa', title: 'de Lancaster' },
  ],
  [Faction.Escocia]: [
    { name: 'Alejandro III', title: 'de Escocia' },
    { name: 'Roberto I', title: 'Bruce' },
    { name: 'William', title: 'Wallace' },
    { name: 'Jacobo IV', title: 'Estuardo' },
    { name: 'Isabel', title: 'MacDuff' },
  ],
};
