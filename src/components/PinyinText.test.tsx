import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import PinyinText from '@/components/PinyinText';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('PinyinText', () => {
  it('renders each syllable in its own element', async () => {
    render(<PinyinText pinyin="nǐ hǎo" />);
    expect(await screen.findByText('nǐ')).toBeInTheDocument();
    expect(screen.getByText('hǎo')).toBeInTheDocument();
  });

  it('tags each syllable with its tone for styling and testing', async () => {
    render(<PinyinText pinyin="mā má mǎ mà ma" />);
    expect((await screen.findByText('mā')).dataset.tone).toBe('1');
    expect(screen.getByText('má').dataset.tone).toBe('2');
    expect(screen.getByText('mǎ').dataset.tone).toBe('3');
    expect(screen.getByText('mà').dataset.tone).toBe('4');
    expect(screen.getByText('ma').dataset.tone).toBe('0');
  });

  it('renders nothing for an empty string', () => {
    const { container } = render(<PinyinText pinyin="" />);
    expect(container.textContent).toBe('');
  });
});
