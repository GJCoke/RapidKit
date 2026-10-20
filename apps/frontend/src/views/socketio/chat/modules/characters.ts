import Doraemon from "@/assets/imgs/avatar_doraemon.jpg"
import Gian from "@/assets/imgs/avatar_gian.jpg"
import Nobita from "@/assets/imgs/avatar_nobita.jpg"
import Shizuka from "@/assets/imgs/avatar_shizuka.jpg"
import Suneo from "@/assets/imgs/avatar_suneo.jpg"

export const CHAT_CHARACTERS = [
  { name: "Doraemon", img: Doraemon },
  { name: "Nobita", img: Nobita },
  { name: "Shizuka", img: Shizuka },
  { name: "Gian", img: Gian },
  { name: "Suneo", img: Suneo },
]

export function characterAvatar(name: string): string | undefined {
  return CHAT_CHARACTERS.find((character) => character.name === name)?.img
}
