import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MainView from '../MainView';
import { AIMode } from '../../../types';

describe('MainView', () => {
  const defaultProps = {
    inputText: '',
    outputText: '',
    mode: AIMode.TRANSLATE,
    isLoading: false,
    error: '',
    successMessage: '',
    onInputChange: jest.fn(),
    onModeChange: jest.fn(),
    onGenerate: jest.fn(),
    onCopyOutput: jest.fn(),
    onOpenSettings: jest.fn(),
  };

  it('renders the header and disabled generate button when input is empty', () => {
    render(
      <MainView
        {...defaultProps}
      />
    );

    expect(screen.getByRole('heading', { name: 'QuickText' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成' })).toBeDisabled();
  });

  it('calls onGenerate when generate is clicked with input', () => {
    const onGenerate = jest.fn();

    render(
      <MainView
        {...defaultProps}
        inputText="hello"
        onGenerate={onGenerate}
      />
    );

    const generateButton = screen.getByRole('button', { name: '生成' });
    expect(generateButton).toBeEnabled();
    fireEvent.click(generateButton);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('prioritizes copy and allows regenerate when output exists', () => {
    const onGenerate = jest.fn();
    const onCopyOutput = jest.fn();

    render(
      <MainView
        {...defaultProps}
        inputText="hello"
        outputText="こんにちは"
        onGenerate={onGenerate}
        onCopyOutput={onCopyOutput}
      />
    );

    const copyButton = screen.getByRole('button', { name: 'コピー' });
    expect(copyButton).toBeEnabled();
    expect(copyButton).toHaveClass('btn-primary');
    fireEvent.click(copyButton);
    expect(onCopyOutput).toHaveBeenCalledTimes(1);

    const regenerateButton = screen.getByRole('button', { name: '再生成' });
    expect(regenerateButton).toBeEnabled();
    fireEvent.click(regenerateButton);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('toggles the source input preview after output is generated', () => {
    const sourceText = 'original source text';

    render(
      <MainView
        {...defaultProps}
        inputText={sourceText}
        outputText="generated result"
      />
    );

    expect(screen.queryByText(sourceText)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /入力/ }));
    expect(screen.getByText(sourceText)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /入力/ }));
    expect(screen.queryByText(sourceText)).not.toBeInTheDocument();
  });
});
