<script lang="ts">
  import { tick } from 'svelte';
  import type { Preferences } from '../stores/preferences.svelte';
  import { focusElement } from '../accessibility/focus';

  type Props = {
    language: string;
    cursor: { line: number; column: number } | null;
    encoding: string;
    lineEnding: string;
    preferences: Preferences;
    onPreferencesChange: (preferences: Preferences) => void;
  };

  let { language, cursor, encoding, lineEnding, preferences, onPreferencesChange }: Props = $props();
  let popover: 'indentation' | 'lineEnding' | null = $state(null);
  let invoker = $state<HTMLButtonElement | null>(null);
  let popoverElement = $state<HTMLElement | null>(null);
  let root = $state<HTMLElement | null>(null);

  const open = async (kind: typeof popover, button: HTMLButtonElement): Promise<void> => {
    invoker = button;
    popover = popover === kind ? null : kind;
    if (popover) {
      await tick();
      popoverElement?.querySelector<HTMLElement>('button, select, input')?.focus();
    }
  };
  const close = (): void => { popover = null; focusElement(invoker); };
  const update = (patch: Partial<Preferences>): void => onPreferencesChange({ ...preferences, ...patch });
</script>

<svelte:window onpointerdown={(event) => { if (popover && event.target instanceof Node && !root?.contains(event.target)) close(); }} />
<footer bind:this={root} class="status-bar" aria-label="Document status">
  <span data-testid="status-language">{language}</span>
  <span data-testid="status-cursor">{cursor ? `Ln ${cursor.line}, Col ${cursor.column}` : 'No cursor'}</span>
  <span data-testid="status-encoding">{encoding}</span>
  <span data-testid="status-line-ending">{lineEnding}</span>
  <button data-testid="status-indentation" type="button" aria-expanded={popover === 'indentation'} onclick={(event) => void open('indentation', event.currentTarget)}>{preferences.indentStyle === 'tabs' ? `Tabs: ${preferences.tabWidth}` : `Spaces: ${preferences.tabWidth}`}</button>
  {#if popover === 'indentation'}
    <div bind:this={popoverElement} class="status-popover" role="dialog" aria-label="Indentation settings" tabindex="-1" onkeydown={(event) => event.key === 'Escape' && close()}>
      <label>Indentation <select value={preferences.indentStyle} onchange={(event) => update({ indentStyle: event.currentTarget.value as Preferences['indentStyle'] })}><option value="spaces">Spaces</option><option value="tabs">Tabs</option></select></label>
      <label>Width <select value={preferences.tabWidth} onchange={(event) => update({ tabWidth: Number(event.currentTarget.value) as Preferences['tabWidth'] })}><option value="2">2</option><option value="4">4</option><option value="8">8</option></select></label>
      <button type="button" onclick={close}>Close</button>
    </div>
  {/if}
</footer>
