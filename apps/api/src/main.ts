import 'reflect-metadata';

import { fileURLToPath } from 'node:url';

import { loadWorkspaceEnvironment } from '@pitstop/config/server';

import { bootstrapApi } from './bootstrap';

loadWorkspaceEnvironment(fileURLToPath(new URL('../../../', import.meta.url)));
void bootstrapApi();
