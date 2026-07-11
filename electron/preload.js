import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('itcertiod', {
  platform: process.platform,
  shell: 'electron',
});
