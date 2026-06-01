export interface IpcChannelMap {
  // renderer → main (invoke/handle)
  "window:minimize": { args: []; return: void }
  "window:maximize": { args: []; return: void }
  "window:close": { args: []; return: void }
  "store:get": { args: [key: string]; return: unknown }
  "store:set": { args: [key: string, value: unknown]; return: void }
  "app:version": { args: []; return: string }

  // main → renderer (send/on)
  "update:available": { args: [version: string]; return: void }
  "update:progress": { args: [percent: number]; return: void }
}
