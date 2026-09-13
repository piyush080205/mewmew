import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

const { SosSmsModule } = NativeModules;

export interface SosSmsResult {
  sent: string[];
  failed: string[];
}

export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS, {
    title: 'SMS Permission',
    message: 'Nirbhay needs SMS permission to send emergency alerts directly from your phone, even without internet.',
    buttonPositive: 'Allow',
  });

  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export async function sendSosSms(recipients: string[], message: string): Promise<SosSmsResult> {
  if (Platform.OS !== 'android' || !SosSmsModule) {
    return { sent: [], failed: recipients };
  }

  const hasPermission = await requestSmsPermission();
  if (!hasPermission) {
    return { sent: [], failed: recipients };
  }

  try {
    return await SosSmsModule.sendSms(recipients, message);
  } catch (error) {
    return { sent: [], failed: recipients };
  }
}
