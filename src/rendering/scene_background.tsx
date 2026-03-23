import './scene_background.css';

type SceneBackgroundProps = {
  preset: string;
};

export function SceneBackground({ preset }: SceneBackgroundProps) {
  return (
    <div className={`scene-background scene-background--${preset}`} aria-hidden="true">
      <div className="scene-background__clouds scene-background__clouds--far" />
      <div className="scene-background__clouds scene-background__clouds--near" />
      <div className="scene-background__vignette" />
    </div>
  );
}
