import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onPrompt = (browserEvent: Event) => {
      browserEvent.preventDefault();
      setEvent(browserEvent as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!event || hidden) return null;
  const install = async () => {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') setEvent(null);
    else setHidden(true);
  };

  return (
    <aside className="install-prompt" aria-label="Установить приложение">
      <span><Download /></span>
      <div><b>Игра всегда под рукой</b><small>Установить на это устройство</small></div>
      <button className="install-prompt__action" onClick={() => void install()}>Установить</button>
      <button className="install-prompt__close" onClick={() => setHidden(true)} aria-label="Не сейчас"><X /></button>
    </aside>
  );
}
