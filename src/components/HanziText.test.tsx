import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { saveSettings } from '@/lib/db/settings';
import HanziText from '@/components/HanziText';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('HanziText', () => {
  it('colours characters by tone when colour is on and no colour prop is passed', async () => {
    render(<HanziText hanzi="好" pinyin="hǎo" />);
    await waitFor(() =>
      expect(screen.getByText('好').closest('[data-tone]')).not.toBeNull(),
    );
  });

  it('does not colour characters when colour={false}', async () => {
    const { container } = render(<HanziText hanzi="好" pinyin="hǎo" colour={false} />);
    // Give the settings query a chance to resolve; colouring must still not appear.
    await waitFor(() => expect(screen.getByText('好')).toBeInTheDocument());
    expect(container.querySelector('[data-tone]')).toBeNull();
  });

  it('does not colour characters when colourHanzi is off in settings', async () => {
    await saveSettings({ colourHanzi: false });
    const { container } = render(<HanziText hanzi="好" pinyin="hǎo" />);
    await waitFor(() => expect(container.querySelector('[data-tone]')).toBeNull());
    expect(screen.getByText('好')).toBeInTheDocument();
  });
});
