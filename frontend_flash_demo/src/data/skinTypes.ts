import mulgae from '../assets/characters/mulgae.png'
import ongdalsaem from '../assets/characters/ongdalsaem.png'
import subuji from '../assets/characters/subuji.png'
import injeolmi from '../assets/characters/injeolmi.png'
import memilmuk from '../assets/characters/memilmuk.png'
import samak from '../assets/characters/samak.png'
import yuriguseul from '../assets/characters/yuriguseul.png'
import hwasan from '../assets/characters/hwasan.png'

export interface SkinType {
  id: string
  label: string
  image: string
  description: string
}

export const skinTypes: SkinType[] = [
  { id: 'mulgae', label: '반질반질물개', image: mulgae, description: '물놀이를 좋아하는 촉촉한 피부, 언제나 매끈해요!' },
  { id: 'memilmuk', label: '얼룩덜룩메밀묵', image: memilmuk, description: '말랑말랑 부드러운 피부, 손대면 톡 터질 것 같아요!' },
  { id: 'ongdalsaem', label: '수분팡팡옹달샘', image: ongdalsaem, description: '맑고 투명한 피부, 속에서부터 수분이 퐁퐁 솟아나요!' },
  { id: 'samak', label: '바스락사막', image: samak, description: '건조함과 친한 피부, 보습이 꼭 필요해요!' },
  { id: 'subuji', label: '겉바속촉수부지', image: subuji, description: '속은 촉촉, 겉은 번들, 종잡을 수 없는 피부예요!' },
  { id: 'yuriguseul', label: '조심조심유리구슬', image: yuriguseul, description: '여리여리 예민한 피부, 조심조심 다뤄줘야 해요!' },
  { id: 'injeolmi', label: '말랑말랑인절미', image: injeolmi, description: '쫀득쫀득 탄력있는 피부, 만지면 기분이 좋아져요!' },
  { id: 'hwasan', label: '울긋불긋화산', image: hwasan, description: '트러블이 톡톡 올라오는 피부, 진정이 필요해요!' },
]

export const RESULT_TYPE_ID = 'yuriguseul'
