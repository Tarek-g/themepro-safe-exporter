#!/usr/bin/env node

/**
 * أداة تنظيف الملفات غير المستخدمة (Unused Files Cleanup Tool)
 * تقرأ تقرير الفحص وتحذف الملفات غير المستخدمة
 */

import fs from 'fs-extra';
import path from 'path';

class UnusedFilesCleanup {
  constructor(auditReportPath, exportDir) {
    this.auditReportPath = auditReportPath;
    this.exportDir = exportDir;
    this.backupDir = path.join(exportDir, '../backup_unused');
  }

  async cleanup() {
    console.log('🧹 بدء تنظيف الملفات غير المستخدمة...');
    
    try {
      // قراءة تقرير الفحص
      const auditReport = await fs.readJson(this.auditReportPath);
      const unusedFiles = auditReport.largest_unused_files || [];
      
      if (unusedFiles.length === 0) {
        console.log('✅ لا توجد ملفات غير مستخدمة للحذف');
        return;
      }

      // إنشاء مجلد النسخ الاحتياطي
      await fs.ensureDir(this.backupDir);
      console.log(`📁 تم إنشاء مجلد النسخ الاحتياطي: ${this.backupDir}`);

      let deletedCount = 0;
      let savedSize = 0;

      // معالجة كل ملف غير مستخدم
      for (const fileInfo of unusedFiles) {
        const filePath = path.join(this.exportDir, fileInfo.path);
        
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
      await this.cleanupEmptyDirectories(this.exportDir);

      console.log('\n📊 ملخص التنظيف:');
      console.log(`   🗑️  الملفات المحذوفة: ${deletedCount}`);
      console.log(`   💾 المساحة المحفوظة: ${Math.round(savedSize / 1024)} KB`);
      console.log(`   📁 النسخ الاحتياطي: ${this.backupDir}`);
      console.log('✅ تم التنظيف بنجاح!');

    } catch (error) {
      console.error('❌ فشل في التنظيف:', error.message);
      throw error;
    }
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
            console.log(`📁 حُذف مجلد فارغ: ${path.relative(this.exportDir, itemPath)}`);
          }
        }
      }
    } catch (error) {
      // تجاهل أخطاء الوصول للمجلدات
    }
  }
}

// واجهة سطر الأوامر
async function main() {
  const auditReportPath = process.argv[2] || './audit/audit-report.json';
  const exportDir = process.argv[3] || './dist';
  
  if (!await fs.pathExists(auditReportPath)) {
    console.error('❌ تقرير الفحص غير موجود:', auditReportPath);
    console.log('الاستخدام: node cleanup-unused.js [audit-report.json] [export-dir]');
    process.exit(1);
  }

  const cleanup = new UnusedFilesCleanup(auditReportPath, exportDir);
  await cleanup.cleanup();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(console.error);
}

export default UnusedFilesCleanup;