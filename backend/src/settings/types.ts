import { AppSettings } from '../app/types.js';
import { CoreSettings } from '../core/types/index.js';

export interface Settings {
  core: CoreSettings;
  app: AppSettings;
}
