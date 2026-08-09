import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChartTooltip from '@/components/ChartTooltip';

describe('ChartTooltip', () => {
  it('renders nothing when the tooltip is inactive', () => {
    const { container } = render(
      <ChartTooltip active={false} label="2026-08-09" payload={[{ name: 'Due', value: 12 }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no payload', () => {
    const { container } = render(<ChartTooltip active label="2026-08-09" payload={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the category label and each series name and value', () => {
    render(
      <ChartTooltip
        active
        label="2026-08-09"
        payload={[{ name: 'Due', value: 12, fill: '#0284c7' }]}
      />,
    );

    expect(screen.getByText('2026-08-09')).toBeInTheDocument();
    expect(screen.getByText('Due')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('applies formatValue to numeric values', () => {
    render(
      <ChartTooltip
        active
        label="2026-07"
        payload={[{ name: 'rate', value: 0.874, stroke: '#16a34a' }]}
        formatValue={(value) => `${Math.round(value * 100)}%`}
      />,
    );

    expect(screen.getByText('87%')).toBeInTheDocument();
  });

  it('leaves non-numeric values alone even when formatValue is given', () => {
    render(
      <ChartTooltip
        active
        label="2026-07"
        payload={[{ name: 'rate', value: 'n/a' }]}
        formatValue={(value) => `${Math.round(value * 100)}%`}
      />,
    );

    expect(screen.getByText('n/a')).toBeInTheDocument();
  });

  it('takes the swatch colour from fill, stroke or color', () => {
    const { container } = render(
      <ChartTooltip active label="2026-08-09" payload={[{ name: 'Due', value: 12, fill: '#0284c7' }]} />,
    );

    const swatch = container.querySelector('[data-testid="tooltip-swatch"]') as HTMLElement;
    expect(swatch).toBeInTheDocument();
    expect(swatch.style.backgroundColor).toBe('rgb(2, 132, 199)');
  });
});
