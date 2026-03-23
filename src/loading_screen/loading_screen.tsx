import './loading_screen.css';

type LoadingScreenProps = {
  scene_name: string;
};

export function LoadingScreen({ scene_name }: LoadingScreenProps) {
  return (
    <main className="loading-screen">
      <div className="loading-screen__content">
        <h1 className="loading-screen__title">{scene_name}</h1>
      </div>

      <div className="loading-screen__spinner-wrap" aria-hidden="true">
        <img
          className="loading-screen__spinner"
          src="/resources/weapons/straight_fuma_shuriken.png"
          alt=""
        />
      </div>
    </main>
  );
}
