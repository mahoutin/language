"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="content">
      <h1>Une erreur est survenue.</h1>
      <p>Vos progrès enregistrés restent dans ce navigateur.</p>
      <button className="btn" onClick={reset}>
        Réessayer
      </button>
    </main>
  );
}
