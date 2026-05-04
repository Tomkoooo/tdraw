require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'CapacitorPencilEnhanced'
  s.version = package['version']
  s.summary = 'Apple Pencil + PencilKit handwriting for tDraw'
  s.license = 'MIT'
  s.homepage = 'https://github.com/local/tdraw'
  s.author = 'tDraw'
  s.source = { :git => 'https://github.com/local/tdraw.git', :tag => s.version.to_s }
  s.source_files = 'ios/Plugin/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
  s.frameworks = 'UIKit', 'PencilKit', 'Vision'
end
