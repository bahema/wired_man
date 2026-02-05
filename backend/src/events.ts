import { EventEmitter } from 'events';

type ContentUpdate = {
  type: 'content_update';
  changed: string[];
  version: number;
  ts: string;
};

let mediaVersion = Date.now();
let contentVersion = 0;

export const contentEvents = new EventEmitter();

export const getMediaVersion = () => mediaVersion;

export const emitContentUpdate = (type: string, detail?: Record<string, unknown>) => {
  void detail;
  if (type === 'media') {
    mediaVersion = Date.now();
  }
  contentVersion += 1;
  const payload: ContentUpdate = {
    type: 'content_update',
    changed: [type],
    version: contentVersion,
    ts: new Date().toISOString()
  };
  contentEvents.emit('content', payload);
};
