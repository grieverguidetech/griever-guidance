import { createContext, useContext } from 'react';
import { googleMapsKey, loadGooglePlaces } from './googlePlaces';
import type { PlacesLoader } from './placesClient';

export interface PlacesConfig {
  /** False when the build has no key. Then the place field is a plain text input in every way. */
  enabled: boolean;
  load: PlacesLoader;
}

const PlacesContext = createContext<PlacesConfig>({ enabled: googleMapsKey() !== '', load: loadGooglePlaces });

/** Tests give a fake here. The app uses the Google loader by default. */
export const PlacesProvider = PlacesContext.Provider;

export const usePlaces = (): PlacesConfig => useContext(PlacesContext);
