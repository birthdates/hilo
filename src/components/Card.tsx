import clsx from "clsx";
import Hearts from "./Hearts";
import Diamonds from "./Diamonds";
import Spades from "./Spades";
import Clubs from "./Clubs";

const suitToComponent: {
  [key: string]: JSX.Element;
} = {
  h: Hearts(),
  d: Diamonds(),
  s: Spades(),
  c: Clubs(),
};

function Card({ suit, card }: { suit: string; card: string }) {
  const suitComp = suitToComponent[suit];
  if (card === "!") card = "10";
  return (
    <div
      className={clsx(
        "flex flex-col p-3 bg-[#CDD3D3] relative rounded-md border-[#808080] border-[2px] pop w-[6rem] h-[8rem] text-xl",
        {
          "text-red-500": suit === "h" || suit === "d",
          "text-black": suit === "s" || suit === "c",
        }
      )}
    >
      <div className="flex flex-row font-bold">
        <div className="flex flex-col">
          <span>{card}</span>
          <span className="mt-auto">{suitComp}</span>
        </div>
        <span className="ml-auto">{card}</span>
      </div>
      <div className="absolute w-full bottom-2 scale-[2] h-full items-center flex justify-center self-center">
        {suitComp}
      </div>
      <div className="flex flex-row mt-auto font-bold transform rotate-180">
        <div className="flex flex-col">
          <span>{card}</span>
          <span className="mt-auto">{suitComp}</span>
        </div>
        <span className="ml-auto">{card}</span>
      </div>
    </div>
  );
}

export default Card;
