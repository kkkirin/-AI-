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
    onOutputChange: jest.fn(),
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

  it('keeps both input and output editable after output is generated', () => {
    const sourceText = 'original source text';
    const onInputChange = jest.fn();
    const onOutputChange = jest.fn();

    render(
      <MainView
        {...defaultProps}
        inputText={sourceText}
        outputText="generated result"
        onInputChange={onInputChange}
        onOutputChange={onOutputChange}
      />
    );

    const input = screen.getByLabelText('入力');
    const output = screen.getByLabelText('出力');
    expect(input).toHaveValue(sourceText);
    expect(output).toHaveValue('generated result');

    fireEvent.change(input, { target: { value: 'edited source' } });
    fireEvent.change(output, { target: { value: 'edited result' } });
    expect(onInputChange).toHaveBeenCalledWith('edited source');
    expect(onOutputChange).toHaveBeenCalledWith('edited result');
  });
});
