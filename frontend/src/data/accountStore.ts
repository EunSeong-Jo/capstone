/**
 * 이메일 가입 · 비밀번호 찾기용 로컬 저장소.
 *
 * 인증 API가 없어 personas.json(고정 6종)과의 대조만으로는 "새로 가입"이 안 된다.
 * 가입한 계정은 여기 localStorage에 Persona와 같은 모양으로 저장하고,
 * 비밀번호 변경은 (personas.json은 고정값이라 직접 못 고치므로) personaId별
 * override 값으로 따로 저장해 실제 로그인 시 원래 비밀번호보다 우선한다.
 */
import { readJSON, writeJSON } from '../context/storage';
import type { Persona } from './personas';

const ACCOUNTS_KEY = 'swappy:customAccounts:v1';
const OVERRIDES_KEY = 'swappy:passwordOverrides:v1';

export function getCustomAccounts(): Persona[] {
  return readJSON<Persona[]>(ACCOUNTS_KEY, []);
}

export function addCustomAccount(persona: Persona): void {
  writeJSON(ACCOUNTS_KEY, [...getCustomAccounts(), persona]);
}

export function getPasswordOverrides(): Record<string, string> {
  return readJSON<Record<string, string>>(OVERRIDES_KEY, {});
}

export function setPasswordOverride(personaId: string, password: string): void {
  writeJSON(OVERRIDES_KEY, { ...getPasswordOverrides(), [personaId]: password });
}
