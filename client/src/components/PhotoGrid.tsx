import { useRef, type Dispatch, type SetStateAction } from 'react';
import { LIMITS } from '../../../shared/types.ts';
import { sound } from '../lib/audio.ts';
import { preparePhoto } from '../lib/learn.ts';
import { createId } from '../lib/util.ts';
import { toast } from '../store/ui.ts';
import { Icon } from './Icon.tsx';

export interface Photo {
  id: string;
  /** Downscaled JPEG as data URL. */
  url: string;
}

/**
 * Photos of learning material: take one with the camera or pick several from the gallery, see them as
 * tiles, remove one. Used for learning stacks and for topics of «Aufgaben».
 */
export function PhotoGrid({
  photos,
  setPhotos,
  preparing,
  setPreparing,
  disabled = false,
  onError,
}: {
  photos: Photo[];
  setPhotos: Dispatch<SetStateAction<Photo[]>>;
  /** Photos still being shrunk – the analysis waits for them. */
  preparing: number;
  setPreparing: Dispatch<SetStateAction<number>>;
  disabled?: boolean;
  onError: (message: string | null) => void;
}) {
  // Two inputs: Android opens only the gallery for a plain multi-file picker, so the camera gets its own.
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    onError(null);
    const free = LIMITS.learnPhotos - photos.length;
    const chosen = Array.from(files).slice(0, free);
    if (files.length > free) toast(`Höchstens ${LIMITS.learnPhotos} Fotos pro Auswertung.`);
    setPreparing((n) => n + chosen.length);
    for (const file of chosen) {
      try {
        const url = await preparePhoto(file);
        setPhotos((list) => [...list, { id: createId(), url }]);
        sound.tap();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Das Foto konnte nicht gelesen werden.');
      } finally {
        setPreparing((n) => n - 1);
      }
    }
  };

  return (
    <>
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="photo-grid">
        {photos.map((photo, i) => (
          <div key={photo.id} className="photo-tile">
            <img src={photo.url} alt={`Foto ${i + 1}`} />
            <button
              type="button"
              className="photo-tile__remove"
              aria-label={`Foto ${i + 1} entfernen`}
              onClick={() => setPhotos((list) => list.filter((p) => p.id !== photo.id))}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
        {Array.from({ length: preparing }, (_, i) => (
          <div key={`prep-${i}`} className="photo-tile is-loading" aria-label="Foto wird vorbereitet">
            <span className="spinner" aria-hidden="true" />
          </div>
        ))}
        {photos.length + preparing < LIMITS.learnPhotos && !disabled && (
          <>
            <button type="button" className="photo-tile photo-tile--add" onClick={() => cameraInput.current?.click()}>
              <Icon name="camera" size={28} />
              <span>{photos.length === 0 ? 'Foto aufnehmen' : 'Weitere Seite'}</span>
            </button>
            <button type="button" className="photo-tile photo-tile--add photo-tile--gallery" onClick={() => galleryInput.current?.click()}>
              <Icon name="image" size={28} />
              <span>Aus der Galerie</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}
