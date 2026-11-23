/** A finger cannot hover. Browsers replay a tap as mouse events (mouseenter, then click) and leave :hover on
 * whatever was tapped, so what a mouse previews on hover flashed and vanished, or stuck, on a phone. Hover
 * handlers therefore ask the pointer what it is, and the hover styles are under @media (hover: hover). */
let last = 'mouse'
if (typeof window !== 'undefined') addEventListener('pointerdown', e => { last = e.pointerType }, true)

/** For onPointerEnter and onPointerLeave: is it a mouse, which can rest over things? (A pen mostly cannot: its enter
 * and leave bracket the contact, as a finger's do.) */
export const hovers = (e: { pointerType: string }) => e.pointerType === 'mouse'

/** For onClick: was it a tap, of a finger or a pen? */
export const tapped = () => last !== 'mouse'
