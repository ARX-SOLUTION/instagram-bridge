import { AppController } from './app.controller.js';

describe('AppController', () => {
  it('returns health status', () => {
    const controller = new AppController();

    expect(controller.health()).toEqual({ status: 'ok' });
  });
});
