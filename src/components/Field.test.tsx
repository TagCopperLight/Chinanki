import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Field, { inputClass } from '@/components/Field';

describe('Field', () => {
  it('gives the input an accessible name of just the label, and exposes the hint as its description', () => {
    render(
      <Field label="Pinyin" hint="Accented, e.g. nǐ hǎo. Suggestions fill this in for you.">
        <input className={inputClass} value="" onChange={() => {}} />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: 'Pinyin' });
    expect(input).toHaveAccessibleName('Pinyin');
    expect(input).toHaveAccessibleDescription(
      'Accented, e.g. nǐ hǎo. Suggestions fill this in for you.',
    );
  });

  it('works with getByLabelText using the exact label text when there is a hint', () => {
    render(
      <Field label="Meaning" hint="Separate multiple senses with a semicolon.">
        <input className={inputClass} value="" onChange={() => {}} />
      </Field>,
    );

    expect(screen.getByLabelText('Meaning')).toBeInTheDocument();
  });

  it('associates a textarea child with the hint too', () => {
    render(
      <Field label="Notes" hint="Shown on the answer side.">
        <textarea className={inputClass} value="" onChange={() => {}} />
      </Field>,
    );

    const textarea = screen.getByRole('textbox', { name: 'Notes' });
    expect(textarea).toHaveAccessibleDescription('Shown on the answer side.');
  });

  it('has no dangling aria-describedby when there is no hint', () => {
    render(
      <Field label="Name">
        <input className={inputClass} value="" onChange={() => {}} />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});
