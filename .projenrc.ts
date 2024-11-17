import { SkepPluginProject } from '@skeptools/skep-plugin-project';
import { NpmAccess } from 'projen/lib/javascript';

const majorVersion = 1;
const project = new SkepPluginProject({
  cdktfProviderPackage: '@skeptools/provider-zenduty@~1',
  defaultReleaseBranch: 'main',
  deps: ['timezone-enum@~1'],
  peerDeps: ['timezone-enum@~1'],
  devDeps: ['@skeptools/skep-plugin-project'],
  name: '@skeptools/plugin-zenduty',
  projenrcTs: true,
  releaseToNpm: true,
  npmAccess: NpmAccess.PUBLIC,
  majorVersion,

  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();