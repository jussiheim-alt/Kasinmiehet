import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'

export async function shareText(title: string, text: string): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title, text, dialogTitle: title })
      return true
    }
    if (navigator.share) {
      await navigator.share({ title, text })
      return true
    }
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
