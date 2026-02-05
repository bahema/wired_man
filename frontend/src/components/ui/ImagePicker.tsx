import React, { useEffect, useState } from 'react';
import Button from './Button';
import Input from './Input';
import { resolveMediaUrl } from '../../data/mediaLibrary';

type ImagePickerProps = {
  label?: string;
  initialUrl?: string;
  helpText?: string;
  onChange?: (value: string) => void;
};

export default function ImagePicker({
  label = 'Featured image',
  initialUrl = '',
  helpText,
  onChange
}: ImagePickerProps) {
  const [urlInput, setUrlInput] = useState(initialUrl);

  useEffect(() => {
    setUrlInput(initialUrl);
  }, [initialUrl]);

  const handleUrlChange = (value: string) => {
    setUrlInput(value);
    if (value) {
      onChange?.(value);
    }
  };
  const previewSrc = resolveMediaUrl(urlInput);

  const clearImage = () => {
    if (!urlInput) return;
    setUrlInput('');
    onChange?.('');
  };

  return (
    <div className="grid gap-3">
      <Input
        label={`${label} URL`}
        placeholder="https://images.example.com/hero.jpg"
        type="url"
        value={urlInput}
        onChange={(event) => handleUrlChange(event.target.value)}
      />
      {helpText ? <p className="text-xs text-text-muted">{helpText}</p> : null}
      {previewSrc ? (
        <div className="rounded-xl border border-border-subtle bg-panel p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-text-muted">Image preview</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <Button size="sm" variant="outline" onClick={clearImage}>
                Clear image
              </Button>
            </div>
          </div>
          <img
            src={previewSrc}
            alt="Image preview"
            className="mt-2 w-full rounded-lg object-cover"
          />
        </div>
      ) : null}
    </div>
  );
}
