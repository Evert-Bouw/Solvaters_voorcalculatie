import { AppSettings } from '../app/settings/types';
import { CoreSettings } from '../core/types';

export interface Settings {
  core: CoreSettings;
  app: AppSettings;
}
