import type { RuntimeManager } from '../engine';
import type { SourceManager } from '../source';
import type { MusicSdkFacade } from '../musicSdk/facade';

/** 跨 handler 共享的运行期上下文。 */
export interface AppContext {
  runtimes: RuntimeManager;
  sources: SourceManager;
  musicSdk: MusicSdkFacade;
}
