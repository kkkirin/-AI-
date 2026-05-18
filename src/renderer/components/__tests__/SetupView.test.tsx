import React from 'react';
import { render, screen } from '@testing-library/react';
import SetupView from '../SetupView';

const mockElectronAPI = {
  checkLocalAIConnection: jest.fn().mockResolvedValue({ success: true, connected: true }),
  getLocalAIEndpoint: jest.fn().mockResolvedValue({ success: true, endpoint: 'http://127.0.0.1:8080/v1', port: 8080, running: true }),
  getLocalModels: jest.fn().mockResolvedValue({ success: true, models: [] }),
  getRecommendedModels: jest.fn().mockResolvedValue([
    { name: 'LFM2.5-1.2B-JP-Q4_K_M', description: 'LFM 2.5 1.2B JP - 日本語特化、軽量高速', size: '約731MB' },
  ]),
  onDownloadProgress: jest.fn(),
  checkModel: jest.fn().mockResolvedValue({ success: true, hasModel: false, models: [] }),
  startServer: jest.fn().mockResolvedValue({ success: true, message: '' }),
  downloadModel: jest.fn().mockResolvedValue({ success: true }),
  reinitializeAI: jest.fn().mockResolvedValue({ success: true }),
  setSetupCompleted: jest.fn().mockResolvedValue({ success: true }),
};

describe('SetupView', () => {
  beforeEach(() => {
    (window as any).electronAPI = mockElectronAPI;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the default LFM model in the setup view', async () => {
    render(<SetupView onComplete={() => {}} />);

    expect(await screen.findByText('LFM2.5-1.2B-JP-Q4_K_M')).toBeInTheDocument();
    expect(await screen.findByText('AIモデルをダウンロード')).toBeInTheDocument();
  });
});
