import { useEffect, useState } from 'react';
import { HAS_PHOTOS, photoUrl, youtubeId, youtubeSearchUrl } from '../data/media';
import { mutate, useAppState } from '../lib/store';
import type { Exercise } from '../types';
import { Icon } from './Icon';
import { toast } from './ui';

/** Miniatura (foto de la posición inicial) */
export function Thumb({ id, size = 48 }: { id: string; size?: number }) {
  if (!HAS_PHOTOS.has(id))
    return (
      <span className="thumb thumb-empty" style={{ width: size, height: size }} aria-hidden="true">
        <Icon name="dumbbell" size={Math.round(size * 0.4)} />
      </span>
    );
  return <img className="thumb" src={photoUrl(id, 0)} alt="" loading="lazy" width={size} height={size} style={{ width: size, height: size }} />;
}

/** Fotos de inicio y final que se alternan como una animación */
export function ExercisePhotos({ ex }: { ex: Exercise }) {
  const has = HAS_PHOTOS.has(ex.id);
  const [frame, setFrame] = useState<0 | 1>(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!has || !playing) return;
    const t = window.setInterval(() => setFrame((f) => (f ? 0 : 1)), 1100);
    return () => window.clearInterval(t);
  }, [has, playing]);
  if (!has) return null;
  return (
    <figure className="photos">
      <button className="photos-stage" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pausar animación' : 'Reproducir animación'}>
        <img src={photoUrl(ex.id, 0)} alt={`${ex.name}: posición inicial`} className={frame === 0 ? 'on' : ''} />
        <img src={photoUrl(ex.id, 1)} alt={`${ex.name}: posición final`} className={frame === 1 ? 'on' : ''} />
      </button>
      <figcaption>
        <button className={frame === 0 ? 'on' : ''} onClick={() => (setPlaying(false), setFrame(0))}>
          1 · Inicio
        </button>
        <button className={frame === 1 ? 'on' : ''} onClick={() => (setPlaying(false), setFrame(1))}>
          2 · Final
        </button>
        {!playing && (
          <button onClick={() => setPlaying(true)}>
            <Icon name="play" size={12} /> Animar
          </button>
        )}
      </figcaption>
    </figure>
  );
}

/** Video: el que tú guardaste (se ve aquí mismo) o búsqueda en YouTube */
export function ExerciseVideo({ ex }: { ex: Exercise }) {
  const s = useAppState();
  const saved = s.videos[ex.id];
  const yt = saved ? youtubeId(saved) : null;
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');

  const save = () => {
    const v = url.trim();
    if (!/^https?:\/\//i.test(v)) {
      toast('Pega un enlace que empiece con https://');
      return;
    }
    mutate((st) => {
      st.videos[ex.id] = v;
    });
    setEditing(false);
    setUrl('');
    toast('Video guardado para este ejercicio');
  };

  return (
    <section className="video-box">
      {yt ? (
        <div className="video-frame">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0&playsinline=1`}
            title={`Video: ${ex.name}`}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
          />
        </div>
      ) : null}
      <div className="btn-row wrap">
        {saved && !yt && (
          <a className="btn primary" href={saved} target="_blank" rel="noopener noreferrer">
            <Icon name="play" size={16} /> Ver mi video
          </a>
        )}
        <a className={`btn ${saved ? 'secondary' : 'primary'}`} href={youtubeSearchUrl(ex.name)} target="_blank" rel="noopener noreferrer">
          <Icon name="play" size={16} /> {saved ? 'Buscar otros videos' : 'Ver videos en YouTube'}
        </a>
        {!editing && (
          <button className="btn ghost" onClick={() => setEditing(true)}>
            <Icon name="edit" size={16} /> {saved ? 'Cambiar mi video' : 'Guardar un video'}
          </button>
        )}
        {saved && !editing && (
          <button
            className="btn ghost"
            onClick={() =>
              mutate((st) => {
                delete st.videos[ex.id];
              })
            }
          >
            Quitar
          </button>
        )}
      </div>
      {editing && (
        <form
          className="video-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="field">
            <span>Pega el enlace del video que te gusta (YouTube se ve aquí mismo)</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" inputMode="url" autoFocus />
          </label>
          <div className="btn-row">
            <button className="btn primary" type="submit">
              Guardar
            </button>
            <button className="btn ghost" type="button" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
