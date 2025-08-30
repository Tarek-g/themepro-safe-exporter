#!/usr/bin/env node

/**
 * أداة التصدير الآلي الكامل (Complete Auto Export Tool)
 * 
 * تنفذ العملية الكاملة:
 * 1. تصدير جديد
 * 2. فحص عربي
 * 3. تنظيف الملفات غير المستخدمة
 * 4. إنتاج المجلد النهائي النظيف
 * 
 * الاستخدام: node auto-export.js <URL>
 */

import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { URL } from 'url';

class AutoExporter {
  constructor(sourceUrl) {
    this.sourceUrl = sourceUrl;
    this.workspaceDir = process.cwd();
    this.tempDir = path.join(this.workspaceDir, 'temp_export');
    this.auditDir = path.join(this.workspaceDir, 'audit');
    this.backupDir = path.join(this.workspaceDir, 'backup_unused');
    
    // استخراج اسم الصفحة من URL
    this.pageName = this.extractPageName(sourceUrl);
    this.finalDir = path.join(this.workspaceDir, this.pageName);
  }

  extractPageName(url) {
    try {
      const urlObj = new URL(url);
      let pageName = urlObj.pathname.replace(/^\/+|\/+$/g, ''); // إزالة الشرطات
      
      if (!pageName || pageName === '') {
        pageName = urlObj.hostname.replace(/[^a-zA-Z0-9-]/g, '-');
      }
      
      // تنظيف اسم المجلد
      pageName = pageName
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      return pageName || 'exported-page';
    } catch (error) {
      return 'exported-page';
    }
  }

  async runCommand(command, args = [], description = '') {
    console.log(`🔄 ${description}...`);
    
    return new Promise((resolve, reject) => {
      const process = spawn('node', [command, ...args], {
        cwd: this.workspaceDir,
        stdio: 'pipe'
      });
      
      let output = '';
      let errorOutput = '';
      
      process.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        // طباعة الناتج في الوقت الفعلي
        console.log(text.trim());
      });
      
      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}: ${errorOutput}`));
        }
      });
    });
  }

  async step1_Export() {
    console.log('\n🚀 المرحلة 1: التصدير الجديد');
    console.log(`📄 الصفحة: ${this.sourceUrl}`);
    console.log(`📁 المجلد المؤقت: ${this.tempDir}`);
    
    // حذف المجلد المؤقت إذا كان موجود
    await fs.remove(this.tempDir);
    
    // إنشاء المجلد المؤقت
    await fs.ensureDir(this.tempDir);
    
    // تغيير مجلد العمل مؤقتاً للتصدير
    const originalCwd = process.cwd();
    process.chdir(this.workspaceDir);
    
    try {
      // تشغيل التصدير مع المعاملات الصحيحة
      await this.runCommand('exporter_v2.js', [
        this.sourceUrl,
        '--mode', 'safe'
      ], 'تصدير الصفحة');
      
      // نقل النتائج من dist إلى temp_export
      const distDir = path.join(this.workspaceDir, 'dist');
      if (await fs.pathExists(distDir)) {
        await fs.copy(distDir, this.tempDir);
        await fs.remove(distDir); // تنظيف dist
      }
    } finally {
      process.chdir(originalCwd);
    }
  }

  async step2_Audit() {
    console.log('\n🔍 المرحلة 2: الفحص العربي');
    
    // حذف مجلد الفحص السابق
    await fs.remove(this.auditDir);
    
    await this.runCommand('post-export-auditor.js', [
      this.sourceUrl,
      this.tempDir
    ], 'فحص الملفات غير المستخدمة');
  }

  async step3_Cleanup() {
    console.log('\n🧹 المرحلة 3: تنظيف الملفات غير المستخدمة');
    
    const auditReportPath = path.join(this.auditDir, 'audit-report.json');
    
    if (!await fs.pathExists(auditReportPath)) {
      throw new Error('تقرير الفحص غير موجود');
    }
    
    // قراءة تقرير الفحص
    const auditReport = await fs.readJson(auditReportPath);
    const unusedFiles = auditReport.largest_unused_files || [];
    
    if (unusedFiles.length === 0) {
      console.log('✅ لا توجد ملفات غير مستخدمة للحذف');
      return;
    }

    // إنشاء نسخة احتياطية
    await fs.remove(this.backupDir);
    await fs.ensureDir(this.backupDir);
    
    let deletedCount = 0;
    let savedSize = 0;

    // حذف الملفات غير المستخدمة (عدا index.html الرئيسي)
    for (const fileInfo of unusedFiles) {
      // تجنب حذف index.html الرئيسي
      if (fileInfo.path === 'index.html') {
        continue;
      }
      
      const filePath = path.join(this.tempDir, fileInfo.path);
      
      if (await fs.pathExists(filePath)) {
        // إنشاء نسخة احتياطية
        const backupPath = path.join(this.backupDir, fileInfo.path);
        await fs.ensureDir(path.dirname(backupPath));
        await fs.copy(filePath, backupPath);
        
        // حذف الملف الأصلي
        await fs.remove(filePath);
        
        deletedCount++;
        savedSize += fileInfo.size;
        
        console.log(`🗑️  حُذف: ${fileInfo.path} (${fileInfo.sizeKB} KB)`);
      }
    }

    // تنظيف المجلدات الفارغة
    await this.cleanupEmptyDirectories(this.tempDir);

    console.log(`\n📊 نتيجة التنظيف: ${deletedCount} ملف محذوف، ${Math.round(savedSize / 1024)} KB محفوظ`);
  }

  async cleanupEmptyDirectories(dir) {
    try {
      const items = await fs.readdir(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = await fs.stat(itemPath);
        
        if (stat.isDirectory()) {
          await this.cleanupEmptyDirectories(itemPath);
          
          // التحقق من المجلد فارغ أم لا
          const remainingItems = await fs.readdir(itemPath);
          if (remainingItems.length === 0) {
            await fs.remove(itemPath);
            console.log(`📁 حُذف مجلد فارغ: ${path.relative(this.tempDir, itemPath)}`);
          }
        }
      }
    } catch (error) {
      // تجاهل أخطاء الوصول للمجلدات
    }
  }

  async step4_CreateFinalOutput() {
    console.log('\n📦 المرحلة 4: إنشاء المجلد النهائي');
    console.log(`📁 اسم المجلد النهائي: ${this.pageName}`);
    
    // حذف المجلد النهائي إذا كان موجود
    await fs.remove(this.finalDir);
    
    // نسخ الملفات المنظفة إلى المجلد النهائي
    await fs.copy(this.tempDir, this.finalDir);
    
    // إضافة ملف معلومات
    const infoFile = {
      source_url: this.sourceUrl,
      export_date: new Date().toISOString(),
      page_name: this.pageName,
      workflow: 'auto-export',
      steps: [
        'Fresh Export',
        'Arabic Audit', 
        'Intelligent Cleanup',
        'Final Output Creation'
      ]
    };
    
    await fs.writeJson(path.join(this.finalDir, 'export-info.json'), infoFile, { spaces: 2 });
    
    console.log(`✅ تم إنشاء المجلد النهائي: ${this.finalDir}`);
  }

  async step5_FinalVerification() {
    console.log('\n🔍 المرحلة 5: التحقق النهائي');
    
    // فحص نهائي للتأكد من سلامة التصدير
    await this.runCommand('post-export-auditor.js', [
      this.sourceUrl,
      this.finalDir
    ], 'التحقق النهائي من التصدير');
    
    // عرض الإحصائيات النهائية
    const finalAuditPath = path.join(this.auditDir, 'audit-report.json');
    if (await fs.pathExists(finalAuditPath)) {
      const finalReport = await fs.readJson(finalAuditPath);
      const summary = finalReport.summary;
      
      console.log('\n🎉 التصدير مكتمل! الإحصائيات النهائية:');
      console.log(`   📁 إجمالي الملفات: ${summary.total_files}`);
      console.log(`   ✅ مستخدمة: ${summary.used_files} (${summary.used_size_kb} KB)`);
      console.log(`   🗑️  غير مستخدمة: ${summary.unused_files} (${summary.unused_size_kb} KB)`);
      console.log(`   📈 نسبة الهدر: ${summary.waste_percentage}%`);
    }
  }

  async cleanup() {
    console.log('\n🧹 تنظيف الملفات المؤقتة...');
    
    // حذف الملفات المؤقتة
    await fs.remove(this.tempDir);
    await fs.remove(this.backupDir);
    
    console.log('✅ تم تنظيف الملفات المؤقتة');
  }

  async run() {
    const startTime = Date.now();
    
    console.log('🚀 بدء التصدير الآلي الكامل');
    console.log(`📄 الصفحة: ${this.sourceUrl}`);
    console.log(`📁 المجلد النهائي: ${this.pageName}`);
    console.log('=' .repeat(60));
    
    try {
      await this.step1_Export();
      await this.step2_Audit();
      await this.step3_Cleanup();
      await this.step4_CreateFinalOutput();
      await this.step5_FinalVerification();
      await this.cleanup();
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      console.log('\n' + '='.repeat(60));
      console.log('🎉 تم إنجاز العملية بنجاح!');
      console.log(`⏱️  المدة الزمنية: ${duration} ثانية`);
      console.log(`📁 المجلد النهائي: ${this.finalDir}`);
      console.log(`🌐 لاختبار النتيجة: node serve-export.js ${this.pageName}`);
      
    } catch (error) {
      console.error('\n❌ فشل في التصدير:', error.message);
      
      // تنظيف في حالة الفشل
      await this.cleanup().catch(() => {});
      
      process.exit(1);
    }
  }
}

// واجهة سطر الأوامر
async function main() {
  const sourceUrl = process.argv[2];
  
  if (!sourceUrl) {
    console.log(`
🚀 أداة التصدير الآلي الكامل

الاستخدام: node auto-export.js <URL>

مثال:
  node auto-export.js http://micro.local/1-2/
  node auto-export.js https://example.com/page

المراحل:
  1. تصدير جديد (Fresh Export)
  2. فحص عربي (Arabic Audit)  
  3. تنظيف ذكي (Smart Cleanup)
  4. إنشاء المجلد النهائي (Final Output)
  5. التحقق النهائي (Final Verification)
`);
    process.exit(1);
  }
  
  const autoExporter = new AutoExporter(sourceUrl);
  await autoExporter.run();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(console.error);
}

export default AutoExporter;