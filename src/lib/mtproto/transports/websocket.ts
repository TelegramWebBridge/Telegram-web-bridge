import {logger, LogTypes} from '@lib/logger';
import Modes from '@config/modes';
import EventListenerBase from '@helpers/eventListenerBase';
import {MTConnection} from '@lib/mtproto/transports/transport';
import ctx from '@environment/ctx';
import {BRIDGE_SUPERSEDED_CLOSE_CODE, dropBridgeConnect, holdBridgeConnect, onBridgeClientSuperseded, withBridgeClient} from '@lib/bridge/client';

const TEST_NO_WEBSOCKET = false;

// let closeSocketBefore = Date.now() + 30e3;
// let closeSocketAfter = Date.now() + 10e3;

export default class Socket extends EventListenerBase<{
  open: () => void,
  message: (buffer: ArrayBuffer) => any,
  close: () => void,
}> implements MTConnection {
  private ws: WebSocket;
  private log: ReturnType<typeof logger>;
  private debug = Modes.debug && false;
  private connectionTimeout: number;

  constructor(protected dcId: number, protected url: string, logSuffix: string) {
    super();

    if(TEST_NO_WEBSOCKET) {
      this.url = url = 'wss://localhost:8081';
    }

    let logTypes = LogTypes.Error | LogTypes.Log;
    if(this.debug) logTypes |= LogTypes.Debug;
    this.log = logger(`WS-${dcId}` + logSuffix, logTypes);
    this.log('constructor');
    this.connect();
  }

  private removeListeners() {
    if(!this.ws) {
      return;
    }

    this.ws.removeEventListener('open', this.handleOpen);
    this.ws.removeEventListener('close', this.handleClose);
    this.ws.removeEventListener('error', this.handleError);
    this.ws.removeEventListener('message', this.handleMessage);
    this.ws = undefined;

    this.clearConnectionTimeout();
  }

  private connect = () => {
    // * Bridge: once another browser has taken the account over, open nothing until a tab takes it back
    if(holdBridgeConnect(this.connect)) {
      return;
    }

    this.ws = new WebSocket(withBridgeClient(this.url), 'binary');
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('open', this.handleOpen);
    this.ws.addEventListener('close', this.handleClose);
    this.ws.addEventListener('error', this.handleError);
    this.ws.addEventListener('message', this.handleMessage);

    this.connectionTimeout = ctx.setTimeout(() => {
      this.handleError(new Error('CONNECTION_TIMEOUT'));
    }, 7500);

    // if(Date.now() < closeSocketBefore) {
    // if(Date.now() >= closeSocketAfter) {
    //   this.ws.close();
    // }
  };

  public close() {
    dropBridgeConnect(this.connect);
    if(!this.ws) {
      return;
    }

    this.log('close execution');

    try {
      this.ws.close();
    } catch(err) {

    }
    this.handleClose();
  }

  private clearConnectionTimeout() {
    clearTimeout(this.connectionTimeout);
    this.connectionTimeout = undefined;
  }

  private handleOpen = () => {
    this.log('opened');

    this.clearConnectionTimeout();
    this.debug && this.log.debug('sending init packet');
    this.dispatchEvent('open');
  };

  private handleError = (e: any) => {
    this.log.error('handleError', e);
    this.close();
  };

  private handleClose = (e?: CloseEvent) => {
    this.log('closed', e/* , this.pending, this.ws.bufferedAmount */);

    if(e?.code === BRIDGE_SUPERSEDED_CLOSE_CODE) {
      onBridgeClientSuperseded();
    }

    this.removeListeners();
    this.dispatchEvent('close');
  };

  private handleMessage = (event: MessageEvent) => {
    this.debug && this.log.debug('<-', 'handleMessage', /* event,  */event.data.byteLength);

    this.dispatchEvent('message', event.data as ArrayBuffer);
  };

  public send = (body: Uint8Array) => {
    this.debug && this.log.debug('-> body length to send:', body.length);

    this.ws.send(body as Uint8Array<ArrayBuffer>);
  };
}
