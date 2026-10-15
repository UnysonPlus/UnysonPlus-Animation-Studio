import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setAssetBase } from '@unysonplus/scene-player';

setAssetBase(`/player/${__PLAYER_VERSION__}/`);
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
