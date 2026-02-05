import React from 'react';
import Button from './Button';

type SliderControlsProps = {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
};

export default function SliderControls({
  canPrev,
  canNext,
  onPrev,
  onNext
}: SliderControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="Previous slide"
      >
        Prev
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={!canNext}
        aria-label="Next slide"
      >
        Next
      </Button>
    </div>
  );
}
