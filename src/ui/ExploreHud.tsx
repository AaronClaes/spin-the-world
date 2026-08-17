// The only chrome explore mode gets: a way out, and the controls, because
// walking is the one thing in this game nobody has been taught. Everything
// else about the mode is the island itself.
//
// The controls line stays up rather than fading. It's one quiet sentence at the
// bottom of a screen that is otherwise all world, and a player who came here
// from the wall has never pressed any of these keys before.
export function ExploreHud({ onWall }: { onWall: () => void }) {
  return (
    <div className="overlay explore-hud">
      <button className="secondary explore-exit" onClick={onWall}>
        Back to the wall
      </button>
      <p className="explore-keys keys">
        WASD or the arrows to walk · shift to run · space to jump · drag to look
        · Esc to leave
      </p>
      <p className="explore-keys touch">drag to look around</p>
    </div>
  );
}
