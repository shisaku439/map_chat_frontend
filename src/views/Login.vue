<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useRouter, useRoute } from 'vue-router'

const username = ref('')
const password = ref('')
const isSubmitting = ref(false)
const snackbar = ref(false)
const error = ref('')

const requiredRule = (v: string | null | undefined): true | string => (!!v && v.length > 0) || '必須です'
const usernameMinRule = (v: string | null | undefined): true | string => ((v?.length ?? 0) >= 3) || '3〜20文字で入力してください'
const lengthRule = (v: string | null | undefined): true | string => ((v?.length ?? 0) <= 20) || '20文字以内'
const usernamePattern = /^[a-zA-Z0-9_]+$/
const usernamePatternRule = (v: string | null | undefined): true | string => (usernamePattern.test(v ?? '')) || '半角英数と_のみ使用できます'
const passwordRule = (v: string | null | undefined): true | string => ((v?.length ?? 0) >= 8 && (v?.length ?? 0) <= 64) || '8〜64文字で入力してください'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

async function onSubmit() {
  if (!username.value) {
    error.value = 'ユーザー名は必須です'
    snackbar.value = true
    return
  }
  if (username.value.length < 3 || username.value.length > 20) {
    error.value = '3〜20文字で入力してください'
    snackbar.value = true
    return
  }
  if (!usernamePattern.test(username.value)) {
    error.value = '半角英数と_のみ使用できます'
    snackbar.value = true
    return
  }

  isSubmitting.value = true
  try {
    // 初心者向けコメント:
    // - まずは「ログイン」を試します
    // - ユーザーが存在しない等で失敗したら「新規登録」を試します
    const uname = username.value.trim()
    const pwd = password.value
    try {
      await auth.login(uname, pwd)
    } catch (e) {
      await auth.register(uname, pwd)
    }
    const next = (route.query.next as string) || '/'
    router.push(next)
  } catch (e) {
    error.value = (e instanceof Error && e.message) ? e.message : 'ログインに失敗しました'
    snackbar.value = true
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <v-container class="d-flex justify-center align-center" style="min-height: 70vh;">
    <v-card width="420">
      <v-card-title class="text-h6">ログイン / 新規登録</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="onSubmit">
          <v-text-field
            v-model="username"
            label="ユーザー名"
            placeholder="例: hanabi_user"
            :rules="[requiredRule, usernameMinRule, lengthRule, usernamePatternRule]"
            required
            clearable
          />
          <v-text-field
            v-model="password"
            label="パスワード"
            type="password"
            placeholder="8〜64文字"
            :rules="[requiredRule, passwordRule]"
            required
            clearable
          />
          <v-btn type="submit" color="primary" :loading="isSubmitting" block>続ける</v-btn>
        </v-form>
      </v-card-text>
    </v-card>
    <v-snackbar v-model="snackbar" color="error">{{ error }}</v-snackbar>
  </v-container>
  
  
  
</template>

<style scoped>
</style>

